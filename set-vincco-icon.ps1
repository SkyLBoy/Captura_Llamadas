$ErrorActionPreference = 'Stop'
$targetDir = 'C:\Users\VNCAdmin-12\Documents\python-projects\Captura_Llamadas\frontend'
New-Item -ItemType Directory -Force -Path ($targetDir + '\public') | Out-Null
Copy-Item -LiteralPath 'C:\Users\VNCAdmin-12\Downloads\vincco-icono.ico' -Destination ($targetDir + '\public\vincco-icono.ico')
$htmlPath = $targetDir + '\index.html'
$htmlText = [System.IO.File]::ReadAllText($htmlPath)
$htmlText = $htmlText.Replace('type="image/svg+xml" href="/vite.svg"', 'type="image/x-icon" href="/vincco-icono.ico"')
[System.IO.File]::WriteAllText($htmlPath, $htmlText)
Get-Content -LiteralPath $htmlPath
Get-FileHash -LiteralPath ($targetDir + '\public\vincco-icono.ico')
Get-FileHash -LiteralPath 'C:\Users\VNCAdmin-12\Downloads\vincco-icono.ico'
