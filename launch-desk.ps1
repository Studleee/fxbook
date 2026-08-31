$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$npm = "C:\Program Files\nodejs\npm.cmd"
$urls = @("http://localhost:5173/", "http://127.0.0.1:5173/")

function Get-LiveUrl {
  foreach ($url in $urls) {
    try {
      Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
      return $url
    } catch {
      # try next
    }
  }
  return $null
}

$live = Get-LiveUrl
if (-not $live) {
  if (-not (Test-Path $npm)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "Node.js / npm was not found. Install Node.js, then try again.",
      "ALGO DESK"
    )
    exit 1
  }

  Start-Process -FilePath $npm -ArgumentList "run", "dev" -WorkingDirectory $root -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(25)
  while (-not $live -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    $live = Get-LiveUrl
  }
}

if ($live) {
  Start-Process $live
} else {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "Could not start ALGO DESK. Open Cursor in the fx book folder and run npm run dev.",
    "ALGO DESK"
  )
  exit 1
}
