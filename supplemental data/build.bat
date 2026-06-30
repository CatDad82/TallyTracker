@echo off
setlocal
cd /d "%~dp0"

echo === Tally Time Tracker - build ===
echo.

REM 1. Ensure PyInstaller is available (install on demand)
python -m PyInstaller --version >nul 2>&1
if errorlevel 1 (
    echo PyInstaller not found - installing it now...
    python -m pip install pyinstaller
    if errorlevel 1 (
        echo [ERROR] Could not install PyInstaller. Is Python on PATH?
        goto :fail
    )
)

REM 2. Clean previous build
echo Cleaning previous build...
if exist dist\TallyTimeTracker rmdir /s /q dist\TallyTimeTracker
if exist build\TallyTimeTracker rmdir /s /q build\TallyTimeTracker

REM 3. Run PyInstaller
echo Running PyInstaller...
python -m PyInstaller TallyTimeTracker.spec --noconfirm
if errorlevel 1 (
    echo [ERROR] PyInstaller failed.
    goto :fail
)

REM 4. Copy browser_extension alongside the exe so users can load it in Chrome
echo Copying browser extension...
xcopy /e /i /q browser_extension dist\TallyTimeTracker\browser_extension

REM 5. Compile the Windows installer with Inno Setup (ISCC)
echo.
echo Building installer with Inno Setup...
set "ISCC="
where iscc >nul 2>&1 && set "ISCC=iscc"
if not defined ISCC if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not defined ISCC (
    echo [WARN] Inno Setup compiler ^(ISCC.exe^) not found.
    echo        The unpacked app is ready in dist\TallyTimeTracker\ but no installer was built.
    echo        Install Inno Setup 6 from https://jrsoftware.org/isdl.php then re-run build.bat.
    goto :done
)
"%ISCC%" installer.iss
if errorlevel 1 (
    echo [ERROR] Inno Setup failed.
    goto :fail
)

:done
echo.
echo === Build complete ===
echo Unpacked app: dist\TallyTimeTracker\
echo Installer:    dist-installer\TallyTimeTracker_Setup_1.2.5.exe
echo.
pause
exit /b 0

:fail
echo.
echo Build did not finish. See the messages above.
pause
exit /b 1
