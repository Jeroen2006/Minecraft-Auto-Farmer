@echo off

for /L %%i in (31,1,40) do (
    start "" node main.js %%i
    timeout /t 5 /nobreak >nul
)