@echo off
echo Starting ngrok for Choice App backend...
ngrok http 5000 --log=stdout
pause