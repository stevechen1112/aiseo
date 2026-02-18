@echo off
setlocal ENABLEDELAYEDEXPANSION
REM Wrapper for restore script: provide psql via postgres container.
set "DBNAME="
set "URL=%~1"
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "$u=[uri]'%URL%'; $db=$u.AbsolutePath.TrimStart('/'); if([string]::IsNullOrWhiteSpace($db)){$db='aiseo'}; $db"`) do set "DBNAME=%%d"
if "%DBNAME%"=="" set "DBNAME=aiseo"
docker exec -i aiseo-postgres psql -U aiseo -d %DBNAME%
exit /b %ERRORLEVEL%
