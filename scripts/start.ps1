$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
& npm.cmd start
exit $LASTEXITCODE
