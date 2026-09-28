@echo off
rem Starts A deckbuilder from this folder and opens it in your browser.
rem Keep the window open while you use the app; close it to stop.
title A deckbuilder
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1"
if errorlevel 1 pause
