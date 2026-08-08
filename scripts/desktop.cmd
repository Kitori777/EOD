@echo off
setlocal

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo Brak programu vswhere.exe. Zainstaluj Microsoft Visual Studio Build Tools z modulem C++.
  exit /b 1
)

set "VSINSTALL="
for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSINSTALL=%%I"

if not defined VSINSTALL (
  echo Brak Microsoft C++ Build Tools. Dodaj skladnik Desktop development with C++.
  exit /b 1
)

call "%VSINSTALL%\Common7\Tools\VsDevCmd.bat" -no_logo -arch=amd64
if errorlevel 1 exit /b %errorlevel%

if /I "%~1"=="dev" (
  call "%~dp0..\node_modules\.bin\tauri.cmd" dev
  exit /b %errorlevel%
)

call "%~dp0..\node_modules\.bin\tauri.cmd" build --bundles nsis
exit /b %errorlevel%
