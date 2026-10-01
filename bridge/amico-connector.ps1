<#
  First Bio Genetics -> Amico DX connector (runs on the Amico DX computer where Icarus runs)

  What it does, every 30 seconds:
    1. Collects new electronic orders FBG has sent to Amico DX and saves each one as an HL7 v2.5.1 ORM^O01 file in
       the Inbound folder for Icarus to import. Tells FBG the order was handed over.
    2. If Icarus drops an HL7 acknowledgement (ACK with MSA) in the Acks folder, reports accept or reject back to FBG.
       File name must start with the referral id that came in the order file name (see step 1), for example
       3f2a..._ACK.hl7, and $UseIcarusAcks below must be $true. Otherwise every order that reaches the Inbound
       folder is reported as accepted.
    3. Uploads HL7 ORU^R01 result files Icarus writes to the Results folder back to FBG's Instrument inbox, where an
       FBG scientist reviews and imports them.

  Setup (once):
    1. FBG creates the key: Lab settings > Amico DX referrals > Connect Amico's computer. They send you this script
       with the key filled in. Treat the key like a password.
    2. Save as C:\AmicoDX\FBG\amico-connector.ps1
    3. Test: powershell -ExecutionPolicy Bypass -File C:\AmicoDX\FBG\amico-connector.ps1 -Test
    4. Run at startup: Task Scheduler > Create Task > Trigger "At startup" > Action:
         powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\AmicoDX\FBG\amico-connector.ps1
       Tick "Run whether user is logged on or not".
    5. Point Icarus at the folders below: import orders from Inbound, write results to Results (and acks to Acks).
#>
param([switch]$Test, [switch]$Once)

# ---------- settings ----------
$FeedUrl   = "__FEED_URL__"        # https://<project>.supabase.co/functions/v1/referral-feed
$UploadUrl = "__UPLOAD_URL__"      # https://<project>.supabase.co/functions/v1/instrument-upload
$DeviceKey = "__DEVICE_KEY__"
$Root      = "C:\AmicoDX\FBG"
$Inbound   = Join-Path $Root "Inbound"    # orders for Icarus
$Acks      = Join-Path $Root "Acks"       # optional: Icarus ACK files
$Results   = Join-Path $Root "Results"    # Icarus ORU result files for FBG
$UseIcarusAcks = $false               # $true once Icarus writes ACK files to the Acks folder (see step 2 above)
$IntervalSeconds = 30
$LogFile   = Join-Path $Root "connector.log"
# ------------------------------

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Log($msg) { $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg; Write-Host $line; Add-Content -Path $LogFile -Value $line }
function Post($url, $body) {
  $json = $body | ConvertTo-Json -Compress -Depth 5
  return Invoke-RestMethod -Method Post -Uri $url -Headers @{ "x-device-key" = $DeviceKey } -ContentType "application/json" -Body $json -TimeoutSec 120
}

foreach ($d in @($Root, $Inbound, $Acks, (Join-Path $Acks "Done"), $Results, (Join-Path $Results "Uploaded"), (Join-Path $Results "Failed"))) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}

if ($Test) {
  try { $r = Post $FeedUrl @{ ping = $true }; Log "Order feed OK. Device: $($r.device)" } catch { Log "Order feed FAILED: $($_.Exception.Message)" }
  try { $r = Post $UploadUrl @{ ping = $true }; Log "Result upload OK. Device: $($r.device)" } catch { Log "Result upload FAILED: $($_.Exception.Message)" }
  exit
}

Log "Connector started. Orders -> $Inbound  Results <- $Results"
while ($true) {
  # 1. New orders
  try {
    $r = Post $FeedUrl @{ action = "pull"; limit = 50 }
    foreach ($m in $r.messages) {
      $name = "{0}_{1}_{2}.hl7" -f $m.id, $m.accession, $m.manifest
      $tmp = Join-Path $Root ($name + ".part")
      [IO.File]::WriteAllText($tmp, $m.message.Replace("`r", "`r`n"))
      Move-Item -Path $tmp -Destination (Join-Path $Inbound $name) -Force
      Log "Order received: $($m.accession) on $($m.manifest)"
      if (-not $UseIcarusAcks) { try { Post $FeedUrl @{ action = "ack"; id = $m.id; status = "accepted"; note = "Saved for Icarus" } | Out-Null } catch { Log "Ack failed for $($m.accession), FBG will resend: $($_.Exception.Message)" } }
    }
  } catch { Log "Order pull failed, will retry: $($_.Exception.Message)" }

  # 2. Acknowledgements from Icarus (optional)
  Get-ChildItem -Path $Acks -File -Filter *.hl7 -ErrorAction SilentlyContinue | ForEach-Object {
    $file = $_; $id = ($file.BaseName -split "_")[0]
    $text = Get-Content -Raw -Path $file.FullName
    $msa = ($text -split "`r`n|`n|`r" | Where-Object { $_ -like "MSA|*" } | Select-Object -First 1)
    $f = if ($msa) { $msa -split "\|" } else { @() }
    $ok = $f.Count -gt 1 -and $f[1] -in @("AA", "CA")
    $note = if ($f.Count -gt 3 -and $f[3]) { $f[3] } elseif ($ok) { "Accepted by Icarus" } else { "Rejected by Icarus" }
    try {
      Post $FeedUrl @{ action = "ack"; id = $id; status = $(if ($ok) { "accepted" } else { "rejected" }); note = $note } | Out-Null
      Move-Item -Path $file.FullName -Destination (Join-Path (Join-Path $Acks "Done") $file.Name) -Force
      Log "Ack sent for $id ($(if ($ok) { 'accepted' } else { 'rejected' }))"
    } catch { Log "Ack upload failed for $id, will retry: $($_.Exception.Message)" }
  }

  # 3. Results back to FBG
  Get-ChildItem -Path $Results -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '^\.(hl7|txt)$' -and $_.LastWriteTime -lt (Get-Date).AddSeconds(-15) } |
    ForEach-Object {
      $file = $_
      try {
        $bytes = [IO.File]::ReadAllBytes($file.FullName)
        $r = Post $UploadUrl @{ instrument = "hl7"; fileName = $file.Name; content = [Convert]::ToBase64String($bytes) }
        Move-Item -Path $file.FullName -Destination (Join-Path (Join-Path $Results "Uploaded") ("{0}_{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $file.Name)) -Force
        if ($r.duplicate) { Log "Result already sent, moved aside: $($file.Name)" } else { Log "Result sent to FBG: $($file.Name)" }
      } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -in 400, 403, 413) {
          Move-Item -Path $file.FullName -Destination (Join-Path (Join-Path $Results "Failed") $file.Name) -Force
          Log "Result rejected ($code), moved to Failed: $($file.Name). $($_.ErrorDetails.Message)"
        } else { Log "Result upload failed, will retry: $($file.Name): $($_.Exception.Message)" }
      }
    }

  if ($Once) { break }
  Start-Sleep -Seconds $IntervalSeconds
}
