@echo off
cd /d "%~dp0"
if exist "%~dp0Recall.exe" (
  start "" "%~dp0Recall.exe"
) else (
  powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\launcher.ps1"
)
