<#
  First Bio Genetics instrument bridge
  1. Watches instrument export folders on this PC and uploads new files to the portal's Instrument inbox.
  2. Optional: talks to the Yumizen C560 over its HL7 host interface (TCP, HL7 v2.3.1):
       - the analyzer scans a tube and asks which tests to run; the bridge asks the portal and answers with the order
       - the analyzer sends results; the bridge acknowledges them at once and uploads them to the Instrument inbox
  A scientist reviews and imports each file in the portal; nothing is imported without review.

  Setup (once):
    1. In the portal: Lab settings > Instrument bridge > Add device. Copy the device key shown.
       For the C560 link, also fill in Lab settings > Yumizen C560 interface (channel numbers and port) first.
    2. Fill in the settings below (or use the copy of this script downloaded from the portal, which has them filled in).
    3. On the C560: Utility > System Setup > LIS Setup. Host IP = this PC's IP address, port = $C560Port below,
       protocol HL7, bidirectional, real-time results on, real-time sample download (barcode query) on.
       Allow the port through Windows Firewall:  netsh advfirewall firewall add rule name="FBG C560" dir=in action=allow protocol=TCP localport=5100
    4. Test: right-click PowerShell > Run as administrator, then:  powershell -ExecutionPolicy Bypass -File C:\FBG\fbg-bridge.ps1 -Test
    5. Run at startup: Task Scheduler > Create Task > Trigger "At startup" > Action:
         powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\FBG\fbg-bridge.ps1
       Tick "Run whether user is logged on or not".
#>
param([switch]$Test, [switch]$Once)

# ---------- settings ----------
$FunctionUrl = "__FUNCTION_URL__"          # e.g. https://<project>.supabase.co/functions/v1/instrument-upload
$DeviceKey   = "__DEVICE_KEY__"
$Folders = @(
  @{ Instrument = "c560";  Path = "C:\FBG\Exports\C560" },          # Yumizen C560 export folder
  @{ Instrument = "sciex"; Path = "C:\FBG\Exports\MultiQuant" },    # MultiQuant results export folder
  @{ Instrument = "hl7";   Path = "C:\FBG\Exports\ReferenceLab" }   # HL7 result files from the reference lab
)
$IntervalSeconds = 30
$LogFile = "C:\FBG\bridge.log"
$C560Port = __C560_PORT__                  # TCP port the C560 connects to (0 = C560 link off)
$C560Dir  = "C:\FBG\C560-HL7"              # results from the C560 wait here until uploaded
$C560BatchSeconds = 60                     # results are uploaded together, at most this often
# ------------------------------

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Log($msg) { $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg; Write-Host $line; Add-Content -Path $LogFile -Value $line }
function Post($body) {
  $json = $body | ConvertTo-Json -Compress
  return Invoke-RestMethod -Method Post -Uri $FunctionUrl -Headers @{ "x-device-key" = $DeviceKey } -ContentType "application/json" -Body $json -TimeoutSec 120
}

New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null
foreach ($f in $Folders) { New-Item -ItemType Directory -Force -Path $f.Path, (Join-Path $f.Path "Uploaded"), (Join-Path $f.Path "Failed") | Out-Null }
if ($C560Port -gt 0) { New-Item -ItemType Directory -Force -Path $C560Dir, (Join-Path $C560Dir "Uploaded") | Out-Null }

if ($Test) {
  try { $r = Post @{ ping = $true }; Log "Connection OK. Device: $($r.device)" } catch { Log "Connection FAILED: $($_.Exception.Message)" }
  if ($C560Port -gt 0) { Log "C560 link: listening port $C560Port. Set this PC's IP and that port on the C560 (LIS Setup)." } else { Log "C560 link: off (C560Port is 0)." }
  exit
}

function Scan-Folders {
  foreach ($f in $Folders) {
    Get-ChildItem -Path $f.Path -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '^\.(csv|txt|xlsx|xls|hl7)$' -and $_.LastWriteTime -lt (Get-Date).AddSeconds(-15) } |
      ForEach-Object {
        $file = $_
        try {
          $bytes = [IO.File]::ReadAllBytes($file.FullName)
          $r = Post @{ instrument = $f.Instrument; fileName = $file.Name; content = [Convert]::ToBase64String($bytes) }
          $dest = Join-Path (Join-Path $f.Path "Uploaded") ("{0}_{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $file.Name)
          Move-Item -Path $file.FullName -Destination $dest -Force
          if ($r.duplicate) { Log "Already uploaded, moved aside: $($file.Name)" } else { Log "Uploaded $($f.Instrument): $($file.Name)" }
        } catch {
          $code = $_.Exception.Response.StatusCode.value__
          if ($code -in 400, 413) {
            Move-Item -Path $file.FullName -Destination (Join-Path (Join-Path $f.Path "Failed") $file.Name) -Force
            Log "Rejected $($file.Name) ($code): moved to Failed. $($_.ErrorDetails.Message)"
          } else {
            Log "Upload failed for $($file.Name), will retry: $($_.Exception.Message)"
          }
        }
      }
  }
}

# ---------- Yumizen C560 HL7 link ----------
# Framing (MLLP): 0x0B + message + 0x1C 0x0D. Segments end with CR. Text is ISO-8859-1.
$Latin1 = [Text.Encoding]::GetEncoding(28591)
$script:Client = $null; $script:Stream = $null
$script:Buf = New-Object System.Collections.Generic.List[byte]
$script:Queue = New-Object System.Collections.Generic.Queue[string]   # complete messages not handled yet
$script:LastC560Upload = Get-Date

function Now14 { Get-Date -Format "yyyyMMddHHmmss" }
function Seg($msg, $name) { foreach ($s in ($msg -split "`r")) { if ($s.StartsWith("$name|")) { return $s } }; return "" }
# Field n of a segment. For MSH, field n is index n-1 (MSH-1 is the separator itself).
function Fld($seg, $n) { $p = $seg -split '\|'; if ($seg.StartsWith("MSH|")) { $n = $n - 1 }; if ($p.Length -gt $n) { return $p[$n].Trim() } else { return "" } }
function Send-Hl7($text) {
  $bytes = New-Object System.Collections.Generic.List[byte]
  $bytes.Add(0x0B); $bytes.AddRange($Latin1.GetBytes($text)); $bytes.Add(0x1C); $bytes.Add(0x0D)
  $arr = $bytes.ToArray(); $script:Stream.Write($arr, 0, $arr.Length); $script:Stream.Flush()
}
# Moves any complete messages from the socket into the queue.
function Read-Frames {
  if ($script:Stream -and $script:Client.Connected -and $script:Stream.DataAvailable) {
    $chunk = New-Object byte[] 65536
    $n = $script:Stream.Read($chunk, 0, $chunk.Length)
    if ($n -gt 0) { for ($i = 0; $i -lt $n; $i++) { $script:Buf.Add($chunk[$i]) } }
  }
  while ($true) {
    $s = $script:Buf.IndexOf([byte]0x0B); if ($s -lt 0) { $script:Buf.Clear(); break }
    $e = $script:Buf.IndexOf([byte]0x1C, $s); if ($e -lt 0) { if ($s -gt 0) { $script:Buf.RemoveRange(0, $s) }; break }
    $msg = $Latin1.GetString($script:Buf.GetRange($s + 1, $e - $s - 1).ToArray())
    $cut = $e + 1; if ($cut -lt $script:Buf.Count -and $script:Buf[$cut] -eq 0x0D) { $cut++ }
    $script:Buf.RemoveRange(0, $cut)
    $script:Queue.Enqueue($msg)
  }
}
function Wait-Ack($ctrl, $seconds) {
  $until = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $until) {
    Read-Frames
    while ($script:Queue.Count -gt 0) {
      $m = $script:Queue.Dequeue()
      $t = Fld (Seg $m "MSH") 9
      if ($t -like "ACK^Q03*") { $a = Seg $m "MSA"; if ((Fld $a 1) -ne "AA") { Log "C560 did not accept order message $ctrl : $(Fld $a 3) ($(Fld $a 6))" }; return }
      Handle-Hl7 $m
    }
    Start-Sleep -Milliseconds 50
  }
  Log "C560: no ACK^Q03 for order message $ctrl within $seconds s"
}
function Handle-Hl7($msg) {
  $msh = Seg $msg "MSH"; $type = Fld $msh 9; $ctrl = Fld $msh 10; $kind = Fld $msh 16
  if ($type -like "ORU^R01*") {
    # Save first, then acknowledge: the analyzer resends anything it doesn't get an ACK for.
    $name = "{0}_{1}_{2}.hl7" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"), ($ctrl -replace '[^0-9A-Za-z]', ''), ([guid]::NewGuid().ToString("N").Substring(0, 6))
    [IO.File]::WriteAllText((Join-Path $C560Dir $name), ($msg.TrimEnd("`r") + "`r"), $Latin1)
    Send-Hl7 ("MSH|^~\&|||||$(Now14)||ACK^R01|$ctrl|P|2.3.1||||$kind||ASCII|||`rMSA|AA|$ctrl|Message accepted|||0|`r")
    $what = if ($kind -eq "2") { "QC" } elseif ($kind -eq "1") { "calibration" } else { "sample " + (Fld (Seg $msg "OBR") 2) }
    Log "C560 result received: $what"
  } elseif ($type -like "QRY^Q02*") {
    $qrd = Seg $msg "QRD"; $qrf = Seg $msg "QRF"; $bc = Fld $qrd 8
    $r = $null
    try { $r = Post @{ action = "c560-query"; ctrl = $ctrl; barcode = $bc; from = (Fld $qrf 2); to = (Fld $qrf 3); sampleFrom = (Fld $qrf 4); sampleTo = (Fld $qrf 5) } }
    catch { Log "C560 query for '$bc' failed: $($_.Exception.Message)" }
    $msgs = @(); if ($r -and $r.messages) { $msgs = @($r.messages) }
    $status = if ($msgs.Count -gt 0) { "OK" } else { "NF" }
    Send-Hl7 ("MSH|^~\&|||||$(Now14)||QCK^Q02|$ctrl|P|2.3.1||||||ASCII|||`rMSA|AA|$ctrl|Message accepted|||0|`rERR|0|`rQAK|SR|$status|`r")
    if ($r -and $r.note) { Log "C560 query: $($r.note)" }
    Log ("C560 query {0}: {1} sample(s)" -f ($(if ($bc) { "barcode $bc" } else { "batch $(Fld $qrf 2)-$(Fld $qrf 3)" })), $msgs.Count)
    foreach ($m in $msgs) { Send-Hl7 $m; Wait-Ack (Fld (Seg $m "MSH") 10) 15 }
  } elseif ($type -like "ACK^*") {
    # stray acknowledgment; nothing to do
  } else {
    Log "C560 sent an unsupported message: $type"
  }
}
function Upload-C560Results {
  $files = @(Get-ChildItem -Path $C560Dir -File -Filter *.hl7 -ErrorAction SilentlyContinue | Sort-Object Name)
  if (-not $files.Count) { return }
  $text = ($files | ForEach-Object { [IO.File]::ReadAllText($_.FullName, $Latin1) }) -join ""
  $name = "C560-HL7_{0}_{1}.hl7" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $files.Count
  try {
    $r = Post @{ instrument = "c560"; fileName = $name; content = [Convert]::ToBase64String($Latin1.GetBytes($text)) }
    foreach ($f in $files) { Move-Item -Path $f.FullName -Destination (Join-Path (Join-Path $C560Dir "Uploaded") $f.Name) -Force }
    Log "Uploaded $($files.Count) C560 result message(s) as $name"
  } catch { Log "C560 result upload failed, will retry: $($_.Exception.Message)" }
}

Log "Bridge started. Watching: $(($Folders | ForEach-Object { $_.Path }) -join ', ')"
$listener = $null
if ($C560Port -gt 0) {
  $listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Any, [int]$C560Port)
  $listener.Start(); Log "C560 link: listening on port $C560Port"
}
$nextScan = Get-Date
while ($true) {
  if ((Get-Date) -ge $nextScan) {
    Scan-Folders
    if ($Once) { if ($listener) { Upload-C560Results; $listener.Stop() }; break }
    $nextScan = (Get-Date).AddSeconds($IntervalSeconds)
  }
  if ($listener) {
    try {
      if ($listener.Pending()) {
        if ($script:Client) { try { $script:Client.Close() } catch {} }
        $script:Client = $listener.AcceptTcpClient(); $script:Stream = $script:Client.GetStream(); $script:Buf.Clear(); $script:Queue.Clear()
        Log "C560 connected from $($script:Client.Client.RemoteEndPoint)"
      }
      if ($script:Client -and $script:Client.Connected) {
        Read-Frames
        while ($script:Queue.Count -gt 0) { Handle-Hl7 ($script:Queue.Dequeue()) }
      } elseif ($script:Client) { Log "C560 disconnected"; $script:Client = $null; $script:Stream = $null }
    } catch {
      Log "C560 link error: $($_.Exception.Message)"
      if ($script:Client) { try { $script:Client.Close() } catch {} }; $script:Client = $null; $script:Stream = $null
    }
    if (((Get-Date) - $script:LastC560Upload).TotalSeconds -ge $C560BatchSeconds) { Upload-C560Results; $script:LastC560Upload = Get-Date }
    Start-Sleep -Milliseconds 100
  } else {
    Start-Sleep -Seconds $IntervalSeconds
  }
}
