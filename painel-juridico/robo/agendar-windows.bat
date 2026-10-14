@echo off
rem Agenda o robo para rodar todo dia util as 07:10 neste computador.
rem Execute uma vez com duplo clique. Para remover: schtasks /Delete /TN "GabineteDigital-Robo" /F
set PASTA=%~dp0
schtasks /Create /TN "GabineteDigital-Robo" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 07:10 /F ^
  /TR "cmd /c cd /d \"%PASTA%\" && python robo.py >> robo.log 2>&1"
if %ERRORLEVEL%==0 (echo Agendado: todo dia util as 07:10. Log em %PASTA%robo.log) else (echo Nao foi possivel agendar. Rode como administrador.)
pause
