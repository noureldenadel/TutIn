@echo off
echo Starting TutIn development server...
echo.

REM Start the dev server in a new window
start "TutIn Dev Server" cmd /k npm run dev

echo.
echo Dev server is running!
echo Press any key to exit this window (the dev server will keep running in the other window)
pause > nul
