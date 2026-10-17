@echo off
rem Serves Squadra Manager on your home network so you can play it on a phone or tablet.
rem The phone must be on the same Wi-Fi. Windows may ask to allow Python through the
rem firewall the first time: allow it on PRIVATE networks.
cd /d "%~dp0"
python desktop\phone_server.py
