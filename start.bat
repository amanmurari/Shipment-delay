@echo off
echo Starting ShipGuard locally...

:: ── Backend ──────────────────────────────────────────────────
start "ShipGuard Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn api.main:app --reload --port 8000"

:: Give backend 3 seconds to start
timeout /t 3 /nobreak >nul

:: ── Frontend ─────────────────────────────────────────────────
start "ShipGuard Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers starting...
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
pause
