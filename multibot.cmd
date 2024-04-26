@echo off

for /L %%i in (50,1,60) do (
    start "" node main.js %%i
    timeout /t 5 /nobreak >nul
)