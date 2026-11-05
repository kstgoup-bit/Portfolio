# HAS KIS quote runner launcher (Windows PowerShell). ASCII only on purpose.
# Keys are typed hidden, kept only in this window's memory, and removed at the end. Nothing is saved.
$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js is not installed. Install the LTS version from nodejs.org, then run again."; exit 1 }
function Plain($x) { $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($x); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } }
$out = Join-Path $env:USERPROFILE "has-kis-snapshots"
Write-Host "This will call KIS Open API: 1 token request + 1 price request per stock (max 6 calls). Prices only. No orders."
$tickers = Read-Host "Stock codes, comma separated, max 5 (example 005930,000660)"
$approve = Read-Host "To approve, type exactly: APPROVE-B-KIS"
$k = Read-Host "App Key (hidden)" -AsSecureString
$s = Read-Host "App Secret (hidden)" -AsSecureString
try {
  $env:KIS_APP_KEY = Plain $k; $env:KIS_APP_SECRET = Plain $s
  node "$PSScriptRoot\kis-quote-runner.cjs" --live "--approve=$approve" "--tickers=$tickers" "--out-dir=$out"
} finally {
  Remove-Item Env:KIS_APP_KEY -ErrorAction SilentlyContinue; Remove-Item Env:KIS_APP_SECRET -ErrorAction SilentlyContinue
}
Write-Host "Done. Result file folder: $out  (do not upload or share it)"
