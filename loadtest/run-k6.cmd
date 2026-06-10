@echo off
REM Thin wrapper: bypasses PowerShell execution policy (same pattern as smoke.cmd).
REM Usage: loadtest\run-k6.cmd s1|s2|s3
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-k6.ps1" %*
