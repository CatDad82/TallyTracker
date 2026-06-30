@echo off
REM Launch Tally Time Tracker from source (dev). Double-click to run.
cd /d "%~dp0"
echo Starting Tally Time Tracker...
where py >nul 2>&1 && ( py -3 TallyTimeTracker.py & goto :eof )
python TallyTimeTracker.py
if errorlevel 1 (
  echo.
  echo Tally exited with an error. Press any key to close.
  pause >nul
)
