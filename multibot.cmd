@echo off

for /L %%i in (1,1,20) do (
    start "" node main.js %%i
    timeout /t 5 /nobreak >nul
)