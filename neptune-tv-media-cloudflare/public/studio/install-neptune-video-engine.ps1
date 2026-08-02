$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Write-Host "Neptune Video Engine - installation" -ForegroundColor Cyan
Write-Host ("PowerShell détecté : " + $PSVersionTable.PSVersion.ToString()) -ForegroundColor DarkGray
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Start-Process "https://www.docker.com/products/docker-desktop/"
  throw "Docker Desktop est requis. Installez-le, démarrez-le, puis relancez ce fichier."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop n'est pas démarré." }
$installRoot = Join-Path $env:LOCALAPPDATA 'NeptuneVideoEngine'
$tempRoot = Join-Path $env:TEMP ('neptune-video-engine-' + [guid]::NewGuid().ToString('N'))
$archive = Join-Path $tempRoot 'neptune.zip'
$extract = Join-Path $tempRoot 'repo'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
Invoke-WebRequest -Uri 'https://github.com/neptunebusinessclub/Neptune-Media-website/archive/refs/heads/main.zip' -OutFile $archive
Expand-Archive -Path $archive -DestinationPath $extract -Force
$source = Get-ChildItem -Path $extract -Directory | Select-Object -First 1
$engineSource = Join-Path $source.FullName 'neptune-video-engine'
if (-not (Test-Path $engineSource)) { throw "Le moteur vidéo est absent de la version téléchargée." }
if (Test-Path $installRoot) {
  Push-Location $installRoot
  try { docker compose down | Out-Null } catch {}
  Pop-Location
  Remove-Item $installRoot -Recurse -Force
}
Copy-Item $engineSource $installRoot -Recurse -Force
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
# Compatible avec Windows PowerShell 5.1 et PowerShell 7+.
$token = ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
$openAiKey = Read-Host "Clé OpenAI locale (facultatif, Entrée pour utiliser Ollama/règles Neptune)"
$envContent = @"
NEPTUNE_ENGINE_TOKEN=$token
WHISPER_MODEL=small
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
NEPTUNE_ENGINE_WORKERS=1
OPENAI_API_KEY=$openAiKey
OPENAI_MODEL=gpt-5-mini
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2:3b
NEPTUNE_ALLOWED_ORIGINS=https://tv.neptunebusiness.com,https://neptune-media-webtv.neptunebusinessclub.workers.dev,http://localhost:8787
"@
Set-Content -Path (Join-Path $installRoot '.env') -Value $envContent -Encoding UTF8
Set-Content -Path (Join-Path $installRoot 'pairing.txt') -Value $token -Encoding UTF8
Push-Location $installRoot
try { docker compose up -d --build } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "Docker n'a pas pu démarrer Neptune Video Engine." }
$healthy = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/health' -Headers @{ 'X-Neptune-Engine-Token' = $token } -TimeoutSec 4
    if ($health.ok) { $healthy = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if (-not $healthy) { throw "Le service est installé mais ne répond pas. Consultez Docker Desktop." }
Set-Clipboard -Value $token
Write-Host "Installation terminée. Le code de connexion est copié dans le presse-papiers." -ForegroundColor Green
Write-Host (Join-Path $installRoot 'pairing.txt')
Start-Process 'https://tv.neptunebusiness.com/studio/video-ai'
Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
