@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi.
  echo Lutfen resmi indirme sayfasini aciyorum:
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

echo Node.js bulundu.
echo Bagimliliklar kuruluyor...
npm install
if errorlevel 1 goto :fail

echo Proje derleniyor...
npm run build
if errorlevel 1 goto :fail

echo.
echo Kurulum tamamlandi.
echo Simdi Baslat.bat dosyasini calistirabilirsiniz.
pause
exit /b 0

:fail
echo.
echo Kurulum tamamlanamadi.
pause
exit /b 1
