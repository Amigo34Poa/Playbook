param(
  [string]$Destino = (Join-Path $env:LOCALAPPDATA 'PlaybookStudio\IA')
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

function Baixar-Verificado([string]$Url, [string]$Arquivo, [string]$Sha256) {
  if ($Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "SHA-256 ausente ou invalido para $Arquivo" }
  if ((Test-Path $Arquivo) -and ((Get-FileHash $Arquivo -Algorithm SHA256).Hash -eq $Sha256)) { return }
  $Parcial = "$Arquivo.download"
  Write-Host "Baixando $(Split-Path $Arquivo -Leaf)..."
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Parcial
  if ((Get-FileHash $Parcial -Algorithm SHA256).Hash -ne $Sha256) {
    Remove-Item $Parcial -Force
    throw 'A verificacao SHA-256 falhou. O arquivo foi descartado.'
  }
  Move-Item -Force $Parcial $Arquivo
}

function Preparar-Motor([string]$Nome, [string]$Url, [string]$Sha256) {
  $Arquivo = Join-Path $Destino "$Nome.zip"
  Baixar-Verificado $Url $Arquivo $Sha256
  $Pasta = Join-Path $Destino $Nome
  # Reextrair somente os arquivos desta distribuicao mantem as DLLs corretas.
  Expand-Archive -LiteralPath $Arquivo -DestinationPath $Pasta -Force
  return $Pasta
}

function Preparar-Modelo([string]$Repositorio, [string]$Nome) {
  # Resolve uma revisao imutavel e obtem o SHA-256 LFS do proprio repositorio.
  $Info = Invoke-RestMethod -Uri "https://huggingface.co/api/models/$Repositorio"
  $Revisao = $Info.sha
  if ($Revisao -notmatch '^[a-fA-F0-9]{40}$') { throw 'A origem nao informou uma revisao de modelo valida.' }
  $Arvore = Invoke-RestMethod -Uri "https://huggingface.co/api/models/$Repositorio/tree/$Revisao`?recursive=false&expand=false&limit=1000"
  $Entrada = @($Arvore | Where-Object { $_.path -eq $Nome })
  if ($Entrada.Count -ne 1) { throw "Modelo nao encontrado na origem oficial: $Nome" }
  $Sha = $Entrada[0].lfs.oid -replace '^sha256:', ''
  $Arquivo = Join-Path $Destino $Nome
  Baixar-Verificado "https://huggingface.co/$Repositorio/resolve/$Revisao/$Nome" $Arquivo $Sha
  return $Arquivo
}

Write-Host 'Preparacao inicial da IA offline. Requer internet e aproximadamente 4 GB livres.'
Write-Host 'Nenhum documento, captura ou audio sera enviado. Depois desta etapa, a IA funciona localmente.'
$Voz = Preparar-Motor 'whisper-v1.7.6' 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip' '0d2eca299c248f965bd0341bcb219db4b433c7f0c0ce2200d4df85765e8156a9'
$Texto = Preparar-Motor 'llama-b11669' 'https://github.com/ggml-org/llama.cpp/releases/download/b11669/llama-b11669-bin-win-cpu-x64.zip' '37b3efcf962847ca869745fd4ccf7f5e7e8dacfeff9fa3523b4ca8cdc66d632b'
$ModeloVoz = Preparar-Modelo 'ggerganov/whisper.cpp' 'ggml-small.bin'
$ModeloTexto = Preparar-Modelo 'Qwen/Qwen2.5-3B-Instruct-GGUF' 'qwen2.5-3b-instruct-q4_k_m.gguf'
$ExecutavelVoz = Get-ChildItem $Voz -Recurse -Filter 'whisper-cli.exe' | Select-Object -First 1
$ExecutavelTexto = Get-ChildItem $Texto -Recurse -Filter 'llama-server.exe' | Select-Object -First 1
if (!$ExecutavelVoz -or !$ExecutavelTexto) { throw 'Os executaveis esperados nao foram encontrados nos arquivos oficiais.' }
$Configuracao = [ordered]@{ whisperExecutable = $ExecutavelVoz.FullName; whisperModel = $ModeloVoz; llamaExecutable = $ExecutavelTexto.FullName; llamaModel = $ModeloTexto; threads = 4 }
$Configuracao | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Destino 'caminhos-ia.json')
Write-Host ''
Write-Host 'Preparacao concluida. Em Configuracoes do Playbook Studio, selecione estes quatro arquivos:'
$Configuracao | Format-List
Write-Host 'Para um computador sem internet, copie esta pasta inteira e selecione os arquivos no destino.'
Write-Host 'Os caminhos acima pertencem a este computador; selecione-os novamente apos transferir.'
