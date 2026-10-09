@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" scripts\export-backup.mjs
) else (
  node scripts\export-backup.mjs
)
pause
