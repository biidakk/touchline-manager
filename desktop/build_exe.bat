@echo off
rem Builds app\TouchlineManager.exe (one file, opens the game in its own window).
rem Needs once:  python -m pip install --user pywebview pyinstaller
cd /d "%~dp0.."
python -m PyInstaller --noconfirm --clean --onefile --windowed --name TouchlineManager ^
  --distpath app --workpath build\pyinstaller --specpath build ^
  --add-data "%CD%\index.html;." --add-data "%CD%\css;css" --add-data "%CD%\src;src" --add-data "%CD%\names.json;." ^
  --add-data "%CD%\sw.js;." --add-data "%CD%\manifest.webmanifest;." --add-data "%CD%\icons;icons" --add-data "%CD%\data;data" ^
  desktop\launcher.py
if errorlevel 1 exit /b 1
if not exist app\names.json copy names.json app\names.json >nul
echo.
echo Built app\TouchlineManager.exe
