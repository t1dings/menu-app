@echo off
chcp 65001 >nul 2>&1
title 鎴戠殑鑿滃崟 - 绉佷汉鑿滆氨绠″
echo.
echo   馃嵔锔? 鎴戠殑鑿滃崟 - 绉佷汉鑿滆氨绠″
echo   ================================
echo.
echo   姝ｅ湪鍚姩鏈嶅姟...
echo.

cd /d "%~dp0"

if not exist node_modules (
    echo   馃摝 棣栨杩愯锛屾鍦ㄥ畨瑁呬緷璧?..
    call npm install --production 2>nul
    if errorlevel 1 (
        echo   鉂?渚濊禆瀹夎澶辫触锛岃妫€鏌ョ綉缁滆繛鎺?        pause
        exit /b 1
    )
    echo   鉁?渚濊禆瀹夎瀹屾垚
    echo.
)

node server.js

pause
