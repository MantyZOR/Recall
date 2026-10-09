@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" scripts\setup-tls.mjs
) else (
  node scripts\setup-tls.mjs
)
pause
