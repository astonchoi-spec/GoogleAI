@echo off
setlocal
cd /d "%~dp0"
set NODE_ENV=development

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if not "%NODE_MAJOR%"=="24" (
  echo This project is pinned to Node 24. Current version:
  node --version
  echo.
  echo Install/use Node 24.14.1, then run this file again.
  pause
  exit /b 1
)

node --experimental-strip-types server/_core/index.ts
if errorlevel 1 (
  echo.
  echo Dev server failed. Check the error above.
  pause
  exit /b %errorlevel%
)
