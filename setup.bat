@echo off
echo ========================================
echo 🚀 ERP Ledger System - Setup Script
echo ========================================
echo.

REM Check if Node.js is installed
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo 📥 Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo ✅ Node.js is installed
node -v
npm -v
echo.

REM Create directories
echo 📁 Creating project structure...
if not exist "app" mkdir app
if not exist "components" mkdir components
if not exist "public" mkdir public
echo ✅ Directories created
echo.

REM Install dependencies
echo 📦 Installing dependencies...
call npm install

if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully
echo.

REM Initialize git if not exists
if not exist ".git" (
    echo 🔧 Initializing Git repository...
    git init
    git add .
    git commit -m "Initial commit: ERP Ledger System"
    echo ✅ Git repository initialized
) else (
    echo ✅ Git repository already exists
)

echo.
echo ✅ Setup complete!
echo.
echo 📋 Next steps:
echo    1. Update API URL in components/ERPLedgerApp.jsx
echo    2. Run: npm run dev
echo    3. Test locally at http://localhost:3000
echo    4. Push to GitHub and deploy to Vercel
echo.
echo 🚀 To start development server:
echo    npm run dev
echo.
pause