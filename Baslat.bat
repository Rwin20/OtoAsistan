@echo off
:: GUNCELLEMELER (AI tarafindan yapilan degisiklikler):
:: - Tarayici altyapisi Chrome'dan Edge'e gecirildi.
:: - Arayuz (UI) modernlestirildi ve Acik/Koyu tema destegi eklendi.
:: - Sohbetlerde ID yerine kisi isimleri/numaralari gosterilecek sekilde ayarlandi.
:: - AI devretme mekanizmasi optimize edildi ve kullanici dostu hata mesajlari eklendi.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-panel.ps1"
if errorlevel 1 pause
