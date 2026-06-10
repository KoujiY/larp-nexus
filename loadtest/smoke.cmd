@echo off
REM Thin wrapper: real logic lives in smoke.ps1 (robust .env parsing).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0smoke.ps1"
