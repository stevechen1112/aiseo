@echo off
setlocal
REM Wrapper for backup script: provide pg_dump via postgres container.
docker exec aiseo-postgres pg_dump --no-owner --no-privileges --format=plain -U aiseo -d aiseo
exit /b %ERRORLEVEL%
