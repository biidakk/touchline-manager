@echo off
rem Starts a local web server for Touchline Manager and opens it in the browser.
cd /d "%~dp0"
rem Open the browser a moment later, once the server is listening.
start "" /b cmd /c "timeout /t 1 /nobreak >nul & start "" http://localhost:8765"
echo Touchline Manager is running at http://localhost:8765
echo Close this window to stop the server.
python -m http.server 8765
