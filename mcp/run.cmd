@echo off
set "LOG_FILE=%~dp0error.log"
echo Starting MCP Server... > "%LOG_FILE%"
node "%~dp0server.js" 2>> "%LOG_FILE%"
