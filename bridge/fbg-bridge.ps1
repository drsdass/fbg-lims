<#
  First Bio Genetics instrument bridge
  Watches instrument export folders on this PC and uploads new files to the portal's Instrument inbox.
  A scientist reviews and imports each file in the portal; nothing is imported without review.

  Setup (once):
    1. In the portal: Lab settings > Instrument bridge > Add device. Copy the device key shown.
    2. Fill in the settings below (or use the copy of this script downloaded from the portal, which has them filled in).
    3. Test: right-click PowerShell > Run as administrator, then:  powershell -ExecutionPolicy Bypass -File C:\FBG\fbg-bridge.ps1 -Test
    4. Run at startup: Task Scheduler > Create Task > Trigger "At startup" > Action:
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
# ------------------------------

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Log($msg) { $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg; Write-Host $line; Add-Content -Path $LogFile -Value $line }
function Post($body) {
  $json = $body | ConvertTo-Json -Compress
  return Invoke-RestMethod -Method Post -Uri $FunctionUrl -Headers @{ "x-device-key" = $DeviceKey } -ContentType "application/json" -Body $json -TimeoutSec 120
}

New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null
foreach ($f in $Folders) { New-Item -ItemType Directory -Force -Path $f.Path, (Join-Path $f.Path "Uploaded"), (Join-Path $f.Path "Failed") | Out-Null }

if ($Test) {
  try { $r = Post @{ ping = $true }; Log "Connection OK. Device: $($r.device)" } catch { Log "Connection FAILED: $($_.Exception.Message)" }
  exit
}

Log "Bridge started. Watching: $(($Folders | ForEach-Object { $_.Path }) -join ', ')"
while ($true) {
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
  if ($Once) { break }
  Start-Sleep -Seconds $IntervalSeconds
}
