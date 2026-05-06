Set-Location -Path (Resolve-Path (Join-Path $PSScriptRoot '..'))
Start-Process -FilePath powershell -ArgumentList '-NoExit','-Command','npm run dev:api'
Start-Sleep -Seconds 2
npm run dev:web
