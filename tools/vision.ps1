# tools/vision.ps1 - 调用 MiniMax 多模态模型（MiniMax-M3）理解本地图片
#
# 用法（key 通过环境变量传入，不写入任何文件）：
#   $env:MINIMAX_API_KEY = 'sk-api-xxx'
#   & tools/vision.ps1 -Image 图片路径 [-Prompt '自定义问题'] [-Model 'MiniMax-M3'] [-MaxTokens 2000]
#
# 示例：
#   & tools/vision.ps1 -Image 'D:\aiCode\animal-kingdom\exec-596886b9-8e79-4d77-b67a-14df7ab79125.png'

param(
  [Parameter(Mandatory = $true)]
  [string]$Image,

  [string]$Prompt = '请用中文详细描述这张图片：画面里有什么场景、建筑、动物角色、颜色风格、光线氛围、美术风格，以及可能的用途。',

  [string]$Model = 'MiniMax-M3',

  [int]$MaxTokens = 2000
)

$ErrorActionPreference = 'Stop'

if (-not $env:MINIMAX_API_KEY) { throw '请先设置环境变量 MINIMAX_API_KEY（密钥不会写入任何文件）' }
if (-not (Test-Path $Image)) { throw "图片不存在: $Image" }

$bytes = [IO.File]::ReadAllBytes((Resolve-Path $Image).Path)
$b64 = [Convert]::ToBase64String($bytes)

$mime = if ($Image -match '\.jpe?g$') { 'image/jpeg' }
        elseif ($Image -match '\.webp$') { 'image/webp' }
        elseif ($Image -match '\.gif$') { 'image/gif' }
        else { 'image/png' }

Write-Host ("[vision] image: {0} ({1:N0} KB)  model: {2}" -f (Split-Path $Image -Leaf), ($bytes.Length / 1KB), $Model)

$payload = @{
  model    = $Model
  messages = @(@{
    role    = 'user'
    content = @(
      @{ type = 'text'; text = $Prompt },
      @{ type = 'image_url'; image_url = @{ url = "data:$mime;base64,$b64" } }
    )
  })
  max_tokens = $MaxTokens
} | ConvertTo-Json -Depth 12

# PS 5.1 下必须用 UTF-8 字节数组发送，否则中文会被编码成 '?'
$utf8Body = [Text.Encoding]::UTF8.GetBytes($payload)

$resp = Invoke-RestMethod -Uri 'https://api.minimaxi.com/v1/chat/completions' -Method Post `
  -Headers @{ Authorization = "Bearer $env:MINIMAX_API_KEY" } `
  -ContentType 'application/json; charset=utf-8' -Body $utf8Body -TimeoutSec 180

$resp.choices[0].message.content
