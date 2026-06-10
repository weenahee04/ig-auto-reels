$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force logs | Out-Null

$log = Join-Path $PSScriptRoot ("logs\run-" + (Get-Date -Format 'yyyy-MM-dd-HHmm') + ".log")
"=== ig-auto-reels $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -Encoding unicode $log

node --env-file-if-exists=.env src/cli.js run *>> $log
$code = $LASTEXITCODE
"=== exit $code ===" | Out-File -Encoding unicode -Append $log

Get-ChildItem logs -Filter 'run-*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force -ErrorAction SilentlyContinue
exit $code
