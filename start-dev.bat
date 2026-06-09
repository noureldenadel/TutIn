@echo off
setlocal
title TutIn Launcher

echo ===================================================
echo             Starting TutIn v4
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
    start https://nodejs.org/
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

:: 3. Check for dependencies and install if missing
if not exist "node_modules\" (
    echo [INFO] First-time setup detected. Installing dependencies...
    echo This might take a few minutes depending on your internet speed. Please wait...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] Failed to install dependencies. Please check your internet connection and try again.
        pause
        exit /b 1
    )
    echo.
    echo [INFO] Dependencies installed successfully!
    echo.
)

:: 4. Start the app
echo [INFO] Starting TutIn server and opening browser...
echo.
npm start

pause
