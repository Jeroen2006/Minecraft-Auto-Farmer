@echo off

for /L %%i in (60,1,70) do (
    start "" node main.js %%i
    timeout /t 5 /nobreak >nul
)