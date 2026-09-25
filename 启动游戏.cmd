@echo off
chcp 65001 >nul
setlocal EnableExtensions
pushd "%~dp0" >nul
set "DRIVE_MAD_DIR=%~dp0"

if not defined PORT set "PORT=4188"
set "GAME_URL=http://127.0.0.1:%PORT%"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 18 或更高版本。
  pause
  popd >nul
  exit /b 1
)

rem 通过健康检查复用已有服务，否则隐藏启动并等待就绪。
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $uri=$env:GAME_URL+'/__drive_mad_health'; function Ready { try { return ((Invoke-RestMethod -Uri $uri -TimeoutSec 1).app -eq 'drive-mad-level-1-recreation') } catch { return $false } }; if (Ready) { exit 0 }; $process=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('server.mjs') -WorkingDirectory $env:DRIVE_MAD_DIR -WindowStyle Hidden -PassThru; for ($attempt=0; $attempt -lt 30; $attempt++) { Start-Sleep -Milliseconds 100; if (Ready) { exit 0 }; if ($process.HasExited) { exit 1 } }; exit 1"
if errorlevel 1 (
  echo 启动失败，端口可能已被其他程序占用。请设置 PORT 后重试。
  pause
  popd >nul
  exit /b 1
)
start "" "%GAME_URL%"
popd >nul
exit /b 0
