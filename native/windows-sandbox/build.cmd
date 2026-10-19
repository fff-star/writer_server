@echo off
setlocal
if not exist bin mkdir bin
cl /nologo /std:c++17 /EHsc /W4 src\windows_sandbox.cpp /Fe:bin\windows-sandbox.exe /link Advapi32.lib Userenv.lib
