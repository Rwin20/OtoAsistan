@echo off
setlocal
cd /d "%~dp0"
echo Lisans Uretici Baslatiliyor...
node scripts\generate_license.cjs
pause
