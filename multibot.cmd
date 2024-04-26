@echo off

for /L %%i in (100,1,120) do (
    start "" node main.js %%i
    timeout /t 5 /nobreak >nul
)