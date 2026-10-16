@echo off
title Animal Town
cd /d "%~dp0"
echo.
echo   Animal Town is starting...
echo   Keep this window open while you play. Close it to stop the game.
echo.

rem open the browser 2 seconds from now (after the little server is ready)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://localhost:8123/'"

where python >nul 2>nul
if not errorlevel 1 (
  python server.py 8123
  goto :eof
)
where py >nul 2>nul
if not errorlevel 1 (
  py server.py 8123
  goto :eof
)
echo   Python was not found. Please install it from https://www.python.org/downloads/
pause
