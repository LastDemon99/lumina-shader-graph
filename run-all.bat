@echo off
setlocal EnableExtensions

rem --- Paths ---
set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"

if not exist "%BACKEND_DIR%\" (
  echo Backend folder not found: "%BACKEND_DIR%"
  exit /b 1
)

if not exist "%FRONTEND_DIR%\" (
  echo Frontend folder not found: "%FRONTEND_DIR%"
  exit /b 1
)

rem --- Find Python (python.exe or Windows launcher py) ---
set "PYTHON=python"
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Python not found. Install Python 3.x and enable the Windows "py" launcher.
    exit /b 1
  )
  set "PYTHON=py -3"
)

rem --- Backend: venv + deps ---
if not exist "%ROOT%backend\venv\Scripts\python.exe" (
  echo [backend] Creating venv...
  pushd "%BACKEND_DIR%"
  %PYTHON% -m venv venv
  popd
)

echo [backend] Installing Python deps...
"%ROOT%backend\venv\Scripts\python.exe" -m pip install --upgrade pip
"%ROOT%backend\venv\Scripts\python.exe" -m pip install -r "%ROOT%backend\requirements.txt"

rem --- Frontend: deps + build ---
echo [frontend] Installing Node deps...
pushd "%FRONTEND_DIR%"
call npm install
echo [frontend] Building...
call npm run build
popd

rem --- Run both services ---
echo Starting services...
echo - Backend:  http://localhost:8000/health
echo - Frontend: http://localhost:3000/

if not exist "%BACKEND_DIR%\venv\Scripts\python.exe" (
  echo [backend] venv python not found: "%BACKEND_DIR%\venv\Scripts\python.exe"
  exit /b 1
)

start "Lumina Backend" /D "%BACKEND_DIR%" cmd /k ""%BACKEND_DIR%\venv\Scripts\python.exe" -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000"
start "Lumina Frontend" /D "%FRONTEND_DIR%" cmd /k "npm run dev"

endlocal
