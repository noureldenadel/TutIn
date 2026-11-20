@echo off
setlocal
cd /d "%~dp0"
title TutIn v8.0 Beta Launcher

echo ===================================================
echo             Starting TutIn v8.0 Beta
echo ===================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo TutIn requires Node.js to run.
    echo.
    echo Press any key to open the Node.js download page...
    pause >nul
    start "" "https://nodejs.org/"
    echo.
    echo Please install the LTS version of Node.js, restart this window, and try again.
    echo.
    pause
    exit /b 1
)

:: 2. Check if npm is available
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not recognized! Ensure Node.js was installed correctly.
    pause
    exit /b 1
)

:: 3. Install dependencies across workspace root, server, and client if missing
if not exist "node_modules\" (
    echo [INFO] Installing root launcher dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install root dependencies. Check your connection and try again.
        pause
        exit /b 1
    )
    echo.
)

if not exist "server\node_modules\" (
    echo [INFO] Installing backend server dependencies...
    call npm --prefix server install
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install server dependencies. Check your connection and try again.
        pause
        exit /b 1
    )
    echo.
)

if not exist "client\node_modules\" (
    echo [INFO] Installing frontend client dependencies...
    call npm --prefix client install
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install client dependencies. Check your connection and try again.
        pause
        exit /b 1
    )
    echo.
)

:: 4. Start backend API + Vite client and open browser
echo [INFO] Starting TutIn v8.0 Beta server (:9474) and client (:5173)...
echo.
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:5173"
call npm start

pause
