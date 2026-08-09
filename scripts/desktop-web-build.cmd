@echo off
setlocal

if defined EYES_NODE_BIN (
  "%EYES_NODE_BIN%\node.exe" "%~dp0..\node_modules\vite\bin\vite.js" build --config vite.desktop.config.ts
  exit /b %errorlevel%
)

call "%~dp0..\node_modules\.bin\vite.cmd" build --config vite.desktop.config.ts
exit /b %errorlevel%

