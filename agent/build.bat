@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo        DYARTE AGENT V1 - Windows Compilation Build
echo ========================================================
echo.

cd /d "%~dp0"

:: Create build directories
if not exist "build" mkdir build
if not exist "build\Release" mkdir build\Release
if not exist "logs" mkdir logs

:: 1. Check for CMake
where cmake >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] CMake detected. Configuring build system...
    cmake -B build -DCMAKE_BUILD_TYPE=Release
    if %errorlevel% neq 0 (
        echo [WARN] CMake default configure failed. Retrying with Visual Studio generator...
        cmake -B build -G "Visual Studio 17 2022" -A x64
    )

    echo [INFO] Compiling dyarte-agent in Release mode...
    cmake --build build --config Release
    if %errorlevel% neq 0 (
        echo [ERROR] CMake compilation failed.
        goto try_cl
    )
    goto finish_check
)

:try_cl
:: 2. Check for MSVC cl.exe (Visual Studio Developer Command Prompt)
where cl >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] MSVC Compiler (cl.exe) detected. Direct compilation starting...
    cl.exe /nologo /W3 /EHsc /std:c++17 /O2 /DNDEBUG /DWIN32 /D_WINDOWS ^
        /I include ^
        src\main.cpp src\websocket_server.cpp ^
        ws2_32.lib crypt32.lib bcrypt.lib wbemuuid.lib ^
        /Fe:build\Release\dyarte-agent.exe ^
        /Fo:build\Release\

    if %errorlevel% neq 0 (
        echo [ERROR] MSVC cl.exe compilation failed.
        goto error_no_compiler
    )
    goto finish_check
)

:error_no_compiler
echo.
echo ========================================================
echo [ERROR] Nenhum compilador C++ compativel foi encontrado no PATH.
echo.
echo Para compilar o dyarte-agent.exe no Windows:
echo   1. Instale o Visual Studio 2022 (Community ou Build Tools)
echo      com a carga de trabalho "Desenvolvimento para desktop com C++"
echo   2. Abra o "x64 Native Tools Command Prompt for VS 2022"
echo   3. Navegue ate a pasta agent\ e execute: build.bat
echo      OU execute diretamente: cmake -B build ^&^& cmake --build build --config Release
echo ========================================================
exit /b 1

:finish_check
:: Verify final binary exists
if exist "build\Release\dyarte-agent.exe" (
    echo.
    echo ========================================================
    echo [SUCCESS] DYARTE Agent V1 compilado com sucesso!
    echo Localizacao: %~dp0build\Release\dyarte-agent.exe
    echo.
    echo Para executar:
    echo   cd build\Release
    echo   dyarte-agent.exe
    echo ========================================================
    exit /b 0
) else if exist "build\dyarte-agent.exe" (
    copy /y "build\dyarte-agent.exe" "build\Release\dyarte-agent.exe" >nul
    echo.
    echo ========================================================
    echo [SUCCESS] DYARTE Agent V1 compilado com sucesso!
    echo Localizacao: %~dp0build\Release\dyarte-agent.exe
    echo ========================================================
    exit /b 0
) else (
    echo [ERROR] O executavel nao foi encontrado no caminho esperado.
    exit /b 1
)
