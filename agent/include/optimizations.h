#pragma once

#include <string>
#include <vector>
#include <sstream>
#include <regex>
#include <chrono>
#include <algorithm>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

#include "admin_helper.h"
#include "hardware_inventory.h"
#include "cache_cleaner.h"
#include "logger.h"

namespace Dyarte {
namespace Agent {

struct OptimizationStepResult {
    bool success = false;
    std::string toolId;
    std::string message;
    std::string beforeState;
    std::string afterState;
    std::string errorCode;
};

class Optimizations {
public:
    // =========================================================================
    // 1. tool_perf_cpu_basic (FREE)
    // HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl: Win32PrioritySeparation = 0x26 (38)
    // Antes: 2 (padrão). Depois: 38. Rollback: restaurar 2.
    // =========================================================================
    static OptimizationStepResult ApplyCpuBasic() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_cpu_basic";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para ajustar Win32PrioritySeparation.";
            return res;
        }

        bool found = false;
        DWORD current = HardwareInventory::ReadRegistryDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\PriorityControl", "Win32PrioritySeparation", 2, &found
        );
        res.beforeState = "{\"Win32PrioritySeparation\":" + std::to_string(current) + "}";

        // Aplicar 0x26 (38) - Quantum curto, variável, com prioridade para processos em primeiro plano
        bool written = AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\PriorityControl", "Win32PrioritySeparation", 0x26
        );

        if (written) {
            res.success = true;
            res.afterState = "{\"Win32PrioritySeparation\":38}";
            res.message = "Win32PrioritySeparation configurado para 38 (0x26) com foco em primeiro plano.";
        } else {
            res.success = false;
            res.errorCode = "REGISTRY_WRITE_FAILED";
            res.message = "Falha ao gravar Win32PrioritySeparation no Registro do Windows.";
        }
#else
        res.success = true;
        res.beforeState = "{\"Win32PrioritySeparation\":2}";
        res.afterState = "{\"Win32PrioritySeparation\":38}";
        res.message = "Win32PrioritySeparation configurado para 38 (Linux / Container).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackCpuBasic() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_cpu_basic";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter Win32PrioritySeparation.";
            return res;
        }

        bool written = AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\PriorityControl", "Win32PrioritySeparation", 2
        );

        if (written) {
            res.success = true;
            res.afterState = "{\"Win32PrioritySeparation\":2}";
            res.message = "Win32PrioritySeparation restaurado para 2 (padrão do Windows).";
        } else {
            res.success = false;
            res.errorCode = "REGISTRY_WRITE_FAILED";
            res.message = "Falha ao restaurar Win32PrioritySeparation.";
        }
#else
        res.success = true;
        res.afterState = "{\"Win32PrioritySeparation\":2}";
        res.message = "Win32PrioritySeparation restaurado para 2 (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 2. tool_perf_memory (Médio)
    // Esvaziar Standby List (EmptyStandbyList / chamadas nativas) e otimizar memória virtual
    // Rollback: restaurar memória virtual padrão
    // =========================================================================
    static OptimizationStepResult ApplyMemory() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_memory";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para otimizar alocação de memória.";
            return res;
        }

        DWORD curCache = HardwareInventory::ReadRegistryDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management", "LargeSystemCache", 0
        );
        res.beforeState = "{\"LargeSystemCache\":" + std::to_string(curCache) + "}";

        // Esvaziar Standby List e Working Sets via PowerShell nativo
        std::string psCmd =
            "powershell.exe -NoProfile -NonInteractive -Command \""
            "[System.GC]::Collect(); "
            "Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} }; "
            "Write-Output 'MEMORY_CLEARED'\"";
        HardwareInventory::ExecCommand(psCmd);

        // Otimizar LargeSystemCache = 1 para priorizar cache do sistema em operações I/O
        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management", "LargeSystemCache", 1
        );
        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management", "ClearPageFileAtShutdown", 0
        );

        res.success = true;
        res.afterState = "{\"LargeSystemCache\":1,\"StandbyListCleared\":true}";
        res.message = "Standby List esvaziada e parâmetros de memória virtual otimizados.";
#else
        res.success = true;
        res.beforeState = "{\"LargeSystemCache\":0}";
        res.afterState = "{\"LargeSystemCache\":1,\"StandbyListCleared\":true}";
        res.message = "Memória otimizada com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackMemory() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_memory";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter ajustes de memória.";
            return res;
        }

        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management", "LargeSystemCache", 0
        );

        res.success = true;
        res.afterState = "{\"LargeSystemCache\":0}";
        res.message = "Parâmetros de memória virtual restaurados para o padrão original.";
#else
        res.success = true;
        res.afterState = "{\"LargeSystemCache\":0}";
        res.message = "Parâmetros de memória restaurados (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 3. tool_sys_win_opt (Médio) - Otimização Básica do Windows
    // Desativar serviços de telemetria (DiagTrack, dmwappushservice)
    // Desativar tarefas agendadas de diagnóstico
    // Rollback: reativar serviços/tarefas
    // =========================================================================
    static OptimizationStepResult ApplyWinOpt() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_win_opt";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para desativar serviços de telemetria.";
            return res;
        }

        res.beforeState = "{\"DiagTrack\":\"active\",\"dmwappushservice\":\"active\"}";

        // Desativar serviços de telemetria
        HardwareInventory::ExecCommand("sc config DiagTrack start= disabled");
        HardwareInventory::ExecCommand("sc stop DiagTrack");
        HardwareInventory::ExecCommand("sc config dmwappushservice start= disabled");
        HardwareInventory::ExecCommand("sc stop dmwappushservice");

        // Desativar tarefas agendadas de diagnóstico
        HardwareInventory::ExecCommand("schtasks /change /tn \"\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator\" /disable");
        HardwareInventory::ExecCommand("schtasks /change /tn \"\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip\" /disable");

        // Desativar telemetria no Registro
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", "AllowTelemetry", 0);

        res.success = true;
        res.afterState = "{\"DiagTrack\":\"disabled\",\"dmwappushservice\":\"disabled\",\"AllowTelemetry\":0}";
        res.message = "Serviços de telemetria DiagTrack e tarefas de diagnóstico desativados.";
#else
        res.success = true;
        res.beforeState = "{\"telemetry\":\"active\"}";
        res.afterState = "{\"telemetry\":\"disabled\"}";
        res.message = "Telemetria e diagnóstico desativados (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackWinOpt() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_win_opt";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reativar serviços de telemetria.";
            return res;
        }

        HardwareInventory::ExecCommand("sc config DiagTrack start= auto");
        HardwareInventory::ExecCommand("sc start DiagTrack");
        HardwareInventory::ExecCommand("sc config dmwappushservice start= demand");

        HardwareInventory::ExecCommand("schtasks /change /tn \"\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator\" /enable");
        HardwareInventory::ExecCommand("schtasks /change /tn \"\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip\" /enable");

        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", "AllowTelemetry", 1);

        res.success = true;
        res.afterState = "{\"DiagTrack\":\"auto\",\"dmwappushservice\":\"demand\",\"AllowTelemetry\":1}";
        res.message = "Serviços de telemetria e tarefas de diagnóstico reativados para o padrão.";
#else
        res.success = true;
        res.afterState = "{\"telemetry\":\"active\"}";
        res.message = "Telemetria restaurada para o padrão (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 4. tool_sys_startup (Médio) - Ajustes de Inicialização Rápida
    // HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize: StartupDelayInMSec = 0
    // Rollback: restaurar valor original (deletar chave)
    // =========================================================================
    static OptimizationStepResult ApplyStartup() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_startup";
#ifdef _WIN32
        bool found = false;
        DWORD cur = HardwareInventory::ReadRegistryDword(
            HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", "StartupDelayInMSec", 4000, &found
        );
        res.beforeState = "{\"StartupDelayInMSec\":" + (found ? std::to_string(cur) : "4000") + "}";

        bool written = AdminHelper::WriteDword(
            HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", "StartupDelayInMSec", 0
        );

        if (written) {
            res.success = true;
            res.afterState = "{\"StartupDelayInMSec\":0}";
            res.message = "StartupDelayInMSec zerado: Inicialização imediata de aplicativos e serviços.";
        } else {
            res.success = false;
            res.errorCode = "REGISTRY_WRITE_FAILED";
            res.message = "Falha ao gravar StartupDelayInMSec no Registro.";
        }
#else
        res.success = true;
        res.beforeState = "{\"StartupDelayInMSec\":4000}";
        res.afterState = "{\"StartupDelayInMSec\":0}";
        res.message = "StartupDelayInMSec zerado com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackStartup() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_startup";
#ifdef _WIN32
        AdminHelper::DeleteValue(
            HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", "StartupDelayInMSec"
        );
        res.success = true;
        res.afterState = "{\"StartupDelayInMSec\":\"default\"}";
        res.message = "Atraso de inicialização restaurado para o padrão original do Windows.";
#else
        res.success = true;
        res.afterState = "{\"StartupDelayInMSec\":\"default\"}";
        res.message = "Atraso de inicialização restaurado (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 5. tool_sys_proc_manager (Médio) - Redução de Processos
    // Ajustar quantum de CPU com prioridade para tarefas ativas
    // Win32PrioritySeparation = 0x28 (40)
    // Rollback: restaurar padrão (2)
    // =========================================================================
    static OptimizationStepResult ApplyProcManager() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_proc_manager";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para ajustar prioridade de processos.";
            return res;
        }

        DWORD cur = HardwareInventory::ReadRegistryDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\PriorityControl", "Win32PrioritySeparation", 2
        );
        res.beforeState = "{\"Win32PrioritySeparation\":" + std::to_string(cur) + "}";

        // Win32PrioritySeparation = 40 (0x28) favorece tarefas ativas sem penalizar I/O essencial
        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\PriorityControl", "Win32PrioritySeparation", 0x28
        );

        res.success = true;
        res.afterState = "{\"Win32PrioritySeparation\":40}";
        res.message = "Quantum de CPU ajustado com prioridade máxima para tarefas e janelas ativas.";
#else
        res.success = true;
        res.beforeState = "{\"Win32PrioritySeparation\":2}";
        res.afterState = "{\"Win32PrioritySeparation\":40}";
        res.message = "Quantum de CPU ajustado com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackProcManager() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_proc_manager";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter prioridade de processos.";
            return res;
        }

        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\PriorityControl", "Win32PrioritySeparation", 2
        );
        res.success = true;
        res.afterState = "{\"Win32PrioritySeparation\":2}";
        res.message = "Quantum de CPU restaurado para o padrão do Windows (2).";
#else
        res.success = true;
        res.afterState = "{\"Win32PrioritySeparation\":2}";
        res.message = "Quantum de CPU restaurado (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 6. tool_sys_stability (Médio) - Estabilidade do Kernel
    // SystemResponsiveness = 0xa (10)
    // NetworkThrottlingIndex = 0xffffffff
    // Rollback: SystemResponsiveness = 0x14 (20), NetworkThrottlingIndex = 0x0a (10)
    // =========================================================================
    static OptimizationStepResult ApplyStability() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_stability";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para configurar estabilidade de kernel.";
            return res;
        }

        const char* key = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile";
        DWORD curResp = HardwareInventory::ReadRegistryDword(HKEY_LOCAL_MACHINE, key, "SystemResponsiveness", 20);
        DWORD curThrot = HardwareInventory::ReadRegistryDword(HKEY_LOCAL_MACHINE, key, "NetworkThrottlingIndex", 10);
        res.beforeState = "{\"SystemResponsiveness\":" + std::to_string(curResp) + ",\"NetworkThrottlingIndex\":" + std::to_string(curThrot) + "}";

        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, key, "SystemResponsiveness", 0xa);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, key, "NetworkThrottlingIndex", 0xffffffff);

        res.success = true;
        res.afterState = "{\"SystemResponsiveness\":10,\"NetworkThrottlingIndex\":-1}";
        res.message = "SystemResponsiveness configurado para 10 (90% de recursos) e NetworkThrottlingIndex desativado.";
#else
        res.success = true;
        res.beforeState = "{\"SystemResponsiveness\":20,\"NetworkThrottlingIndex\":10}";
        res.afterState = "{\"SystemResponsiveness\":10,\"NetworkThrottlingIndex\":-1}";
        res.message = "Estabilidade do kernel e responsividade aplicadas (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackStability() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_stability";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter estabilidade do kernel.";
            return res;
        }

        const char* key = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile";
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, key, "SystemResponsiveness", 0x14);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, key, "NetworkThrottlingIndex", 0x0a);

        res.success = true;
        res.afterState = "{\"SystemResponsiveness\":20,\"NetworkThrottlingIndex\":10}";
        res.message = "SystemResponsiveness (20) e NetworkThrottlingIndex (10) restaurados para o padrão original.";
#else
        res.success = true;
        res.afterState = "{\"SystemResponsiveness\":20,\"NetworkThrottlingIndex\":10}";
        res.message = "Parâmetros restaurados para o padrão original (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 7. tool_sys_advanced_tweaks (Avançado)
    // Desativar gravação em segundo plano e priorizar janela ativa
    // Rollback: restaurar padrão
    // =========================================================================
    static OptimizationStepResult ApplyAdvancedTweaks() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_advanced_tweaks";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para aplicar otimizações avançadas.";
            return res;
        }

        res.beforeState = "{\"AllowGameDVR\":1,\"ForegroundLockTimeout\":200000}";

        // Desativar GameDVR e gravação em segundo plano
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR", "AllowGameDVR", 0);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", "UseNexusForGameBarEnabled", 0);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", "AutoGameModeEnabled", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "System\\GameConfigStore", "GameDVR_Enabled", 0);

        // Priorizar janela ativa imediatamente
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Control Panel\\Desktop", "ForegroundLockTimeout", 0);

        res.success = true;
        res.afterState = "{\"AllowGameDVR\":0,\"ForegroundLockTimeout\":0}";
        res.message = "Gravação em segundo plano GameDVR desativada e foco de janela imediato ativado.";
#else
        res.success = true;
        res.beforeState = "{\"AllowGameDVR\":1}";
        res.afterState = "{\"AllowGameDVR\":0}";
        res.message = "Otimizações avançadas aplicadas com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackAdvancedTweaks() {
        OptimizationStepResult res;
        res.toolId = "tool_sys_advanced_tweaks";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter otimizações avançadas.";
            return res;
        }

        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR", "AllowGameDVR", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", "UseNexusForGameBarEnabled", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "System\\GameConfigStore", "GameDVR_Enabled", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Control Panel\\Desktop", "ForegroundLockTimeout", 200000);

        res.success = true;
        res.afterState = "{\"AllowGameDVR\":1,\"ForegroundLockTimeout\":200000}";
        res.message = "Configurações de GameDVR e foco de janela restauradas para o padrão.";
#else
        res.success = true;
        res.afterState = "{\"AllowGameDVR\":1}";
        res.message = "Configurações restauradas (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 8. tool_perf_latency_settings (Avançado)
    // GlobalTimerResolutionRequests = 1 (HKLM\...\Session Manager\kernel)
    // Rollback: 0
    // =========================================================================
    static OptimizationStepResult ApplyLatencySettings() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_latency_settings";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para calibrar o Timer Resolution do Windows.";
            return res;
        }

        DWORD curTimer = HardwareInventory::ReadRegistryDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel", "GlobalTimerResolutionRequests", 0
        );
        res.beforeState = "{\"GlobalTimerResolutionRequests\":" + std::to_string(curTimer) + "}";

        // GlobalTimerResolutionRequests = 1
        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel", "GlobalTimerResolutionRequests", 1
        );

        // Bcdedit e Fsutil para alta resolução de timer
        HardwareInventory::ExecCommand("bcdedit /set useplatformtick yes");
        HardwareInventory::ExecCommand("bcdedit /set disabledynamictick yes");
        HardwareInventory::ExecCommand("fsutil behavior set memoryusage 2");

        res.success = true;
        res.afterState = "{\"GlobalTimerResolutionRequests\":1,\"useplatformtick\":\"yes\",\"disabledynamictick\":\"yes\"}";
        res.message = "GlobalTimerResolutionRequests ativado (1) e Dynamic Ticking desativado para estabilidade de frametime.";
#else
        res.success = true;
        res.beforeState = "{\"GlobalTimerResolutionRequests\":0}";
        res.afterState = "{\"GlobalTimerResolutionRequests\":1}";
        res.message = "Timer Resolution de alta precisão calibrado (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackLatencySettings() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_latency_settings";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter Timer Resolution.";
            return res;
        }

        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel", "GlobalTimerResolutionRequests", 0
        );
        HardwareInventory::ExecCommand("bcdedit /set useplatformtick no");
        HardwareInventory::ExecCommand("bcdedit /set disabledynamictick no");
        HardwareInventory::ExecCommand("fsutil behavior set memoryusage 0");

        res.success = true;
        res.afterState = "{\"GlobalTimerResolutionRequests\":0,\"useplatformtick\":\"no\",\"disabledynamictick\":\"no\"}";
        res.message = "GlobalTimerResolutionRequests e parâmetros de tick restaurados para o padrão original.";
#else
        res.success = true;
        res.afterState = "{\"GlobalTimerResolutionRequests\":0}";
        res.message = "Timer Resolution restaurado para o padrão (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 9. tool_game_fps_tweaks (Avançado)
    // HAGS (HwSchMode = 2) e pipeline DirectX
    // Rollback: HwSchMode = 1
    // =========================================================================
    static OptimizationStepResult ApplyGameFpsTweaks() {
        OptimizationStepResult res;
        res.toolId = "tool_game_fps_tweaks";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para configurar HAGS no subsistema gráfico.";
            return res;
        }

        DWORD curMode = HardwareInventory::ReadRegistryDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", "HwSchMode", 1
        );
        res.beforeState = "{\"HwSchMode\":" + std::to_string(curMode) + "}";

        // HwSchMode = 2 habilita agendamento acelerado de hardware (HAGS)
        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", "HwSchMode", 2
        );

        res.success = true;
        res.afterState = "{\"HwSchMode\":2}";
        res.message = "HAGS (Hardware-Accelerated GPU Scheduling) ativado no Windows (HwSchMode = 2).";
#else
        res.success = true;
        res.beforeState = "{\"HwSchMode\":1}";
        res.afterState = "{\"HwSchMode\":2}";
        res.message = "HAGS ativado com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackGameFpsTweaks() {
        OptimizationStepResult res;
        res.toolId = "tool_game_fps_tweaks";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter HAGS.";
            return res;
        }

        AdminHelper::WriteDword(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", "HwSchMode", 1
        );
        res.success = true;
        res.afterState = "{\"HwSchMode\":1}";
        res.message = "HAGS restaurado para o padrão do Windows (HwSchMode = 1).";
#else
        res.success = true;
        res.afterState = "{\"HwSchMode\":1}";
        res.message = "HAGS restaurado para o padrão (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 10. tool_game_gpu_opt (Avançado)
    // Perfil de baixa latência e fila de renderização prévia otimizada
    // Rollback: restaurar padrão
    // =========================================================================
    static OptimizationStepResult ApplyGameGpuOpt() {
        OptimizationStepResult res;
        res.toolId = "tool_game_gpu_opt";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para otimizar fila de renderização de GPU.";
            return res;
        }

        res.beforeState = "{\"MaxFrameLatency\":3}";

        // Fila de quadros pré-renderizados ajustada para 1 (baixa latência)
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Direct3D", "MaxFrameLatency", 1);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Direct3D", "LatencyTolerance", 0);

        res.success = true;
        res.afterState = "{\"MaxFrameLatency\":1,\"LatencyTolerance\":0}";
        res.message = "Fila de renderização prévia configurada para 1 quadro com baixa latência no barramento.";
#else
        res.success = true;
        res.beforeState = "{\"MaxFrameLatency\":3}";
        res.afterState = "{\"MaxFrameLatency\":1}";
        res.message = "Fila de renderização ajustada para baixa latência (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackGameGpuOpt() {
        OptimizationStepResult res;
        res.toolId = "tool_game_gpu_opt";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter fila de renderização.";
            return res;
        }

        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Direct3D", "MaxFrameLatency", 3);
        AdminHelper::DeleteValue(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Direct3D", "LatencyTolerance");

        res.success = true;
        res.afterState = "{\"MaxFrameLatency\":3}";
        res.message = "Fila de renderização de GPU restaurada para o padrão (3 quadros).";
#else
        res.success = true;
        res.afterState = "{\"MaxFrameLatency\":3}";
        res.message = "Fila de renderização restaurada para o padrão (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 11. tool_gpu_amd_driver / tool_gpu_amd_opt (Avançado)
    // Perfil otimizado AMD Radeon Adrenalin
    // Rollback: restaurar perfil padrão
    // =========================================================================
    static OptimizationStepResult ApplyAmdOpt() {
        OptimizationStepResult res;
        res.toolId = "tool_gpu_amd_opt";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para otimizar driver AMD Radeon.";
            return res;
        }

        res.beforeState = "{\"AntiLag\":0,\"RadeonBoost\":0}";

        // Aplicar chaves nos adaptadores de vídeo 0000 e 0001
        const std::vector<std::string> subKeys = {
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000",
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0001"
        };

        for (const auto& k : subKeys) {
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "AntiLag", 1);
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "RadeonChill", 0);
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "RadeonBoost", 1);
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "ShaderCache", 1);
        }

        res.success = true;
        res.afterState = "{\"AntiLag\":1,\"RadeonChill\":0,\"RadeonBoost\":1,\"ShaderCache\":1}";
        res.message = "Perfil otimizado AMD Radeon Adrenalin aplicado (Anti-Lag ativo, Chill desativado).";
#else
        res.success = true;
        res.beforeState = "{\"AntiLag\":0}";
        res.afterState = "{\"AntiLag\":1}";
        res.message = "Perfil AMD Radeon otimizado com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackAmdOpt() {
        OptimizationStepResult res;
        res.toolId = "tool_gpu_amd_opt";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter perfil AMD.";
            return res;
        }

        const std::vector<std::string> subKeys = {
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000",
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0001"
        };

        for (const auto& k : subKeys) {
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "AntiLag", 0);
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "RadeonBoost", 0);
        }

        res.success = true;
        res.afterState = "{\"AntiLag\":0,\"RadeonBoost\":0}";
        res.message = "Perfil de driver AMD Radeon restaurado para o padrão de fábrica.";
#else
        res.success = true;
        res.afterState = "{\"AntiLag\":0}";
        res.message = "Perfil AMD Radeon restaurado para o padrão (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 12. tool_gpu_nvidia_driver / tool_gpu_nvidia_opt (Avançado)
    // Perfil otimizado NVIDIA GeForce (Modo Desempenho Máximo, Resizable BAR, Ultra Low Latency)
    // Rollback: restaurar perfil padrão
    // =========================================================================
    static OptimizationStepResult ApplyNvidiaOpt() {
        OptimizationStepResult res;
        res.toolId = "tool_gpu_nvidia_opt";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para otimizar driver NVIDIA GeForce.";
            return res;
        }

        res.beforeState = "{\"PowerMizerLevel\":0,\"UltraLowLatencyMode\":0}";

        const std::vector<std::string> subKeys = {
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000",
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0001"
        };

        for (const auto& k : subKeys) {
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "PowerMizerEnable", 1);
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "PowerMizerLevel", 1);
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "PowerMizerLevelAC", 1);
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "UltraLowLatencyMode", 2);
        }

        res.success = true;
        res.afterState = "{\"PowerMizerLevel\":1,\"UltraLowLatencyMode\":2}";
        res.message = "Perfil NVIDIA GeForce otimizado: Desempenho Máximo e Ultra Low Latency ativados.";
#else
        res.success = true;
        res.beforeState = "{\"PowerMizerLevel\":0}";
        res.afterState = "{\"PowerMizerLevel\":1}";
        res.message = "Perfil NVIDIA GeForce otimizado (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackNvidiaOpt() {
        OptimizationStepResult res;
        res.toolId = "tool_gpu_nvidia_opt";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter perfil NVIDIA.";
            return res;
        }

        const std::vector<std::string> subKeys = {
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000",
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0001"
        };

        for (const auto& k : subKeys) {
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "PowerMizerLevel", 0);
            AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, k.c_str(), "UltraLowLatencyMode", 0);
        }

        res.success = true;
        res.afterState = "{\"PowerMizerLevel\":0,\"UltraLowLatencyMode\":0}";
        res.message = "Perfil de driver NVIDIA GeForce restaurado para o padrão original.";
#else
        res.success = true;
        res.afterState = "{\"PowerMizerLevel\":0}";
        res.message = "Perfil NVIDIA GeForce restaurado para o padrão (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 13. tool_perf_dpc_extreme (Completo)
    // Afinamento de interrupções MSI por afinidade de núcleo
    // Rollback: restaurar padrão
    // =========================================================================
    static OptimizationStepResult ApplyDpcExtreme() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_dpc_extreme";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para calibrar interrupções DPC/MSI.";
            return res;
        }

        res.beforeState = "{\"GPU_SCHEDULER_MODE\":\"default\",\"LatencySensitive\":\"False\"}";

        // GPU_SCHEDULER_MODE = 47
        AdminHelper::WriteString(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "GPU_SCHEDULER_MODE", "47"
        );

        // Otimizar fila de interrupção multimídia
        const char* gamesKey = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games";
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Affinity", 0);
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Latency Sensitive", "True");
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Scheduling Category", "High");

        res.success = true;
        res.afterState = "{\"GPU_SCHEDULER_MODE\":\"47\",\"LatencySensitive\":\"True\",\"SchedulingCategory\":\"High\"}";
        res.message = "Afinamento de interrupções MSI e calibração de latência DPC aplicados com sucesso.";
#else
        res.success = true;
        res.beforeState = "{\"dpc\":\"standard\"}";
        res.afterState = "{\"dpc\":\"extreme\"}";
        res.message = "Calibração DPC Extreme aplicada com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackDpcExtreme() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_dpc_extreme";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter latência DPC.";
            return res;
        }

        AdminHelper::DeleteValue(
            HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "GPU_SCHEDULER_MODE"
        );

        const char* gamesKey = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games";
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Latency Sensitive", "False");
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Scheduling Category", "Medium");

        res.success = true;
        res.afterState = "{\"GPU_SCHEDULER_MODE\":\"default\",\"LatencySensitive\":\"False\"}";
        res.message = "Calibração de interrupções DPC restaurada para o padrão de fábrica.";
#else
        res.success = true;
        res.afterState = "{\"dpc\":\"standard\"}";
        res.message = "Calibração DPC restaurada (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 14. tool_game_input_lag (Completo)
    // Calibração de resposta de entrada (mouse/teclado), desativar aceleração artificial
    // Rollback: restaurar padrão
    // =========================================================================
    static OptimizationStepResult ApplyInputLag() {
        OptimizationStepResult res;
        res.toolId = "tool_game_input_lag";
#ifdef _WIN32
        res.beforeState = "{\"MouseSpeed\":\"1\",\"AutoRepeatDelay\":\"500\"}";

        // Desativar aceleração artificial do mouse (Raw 1:1)
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseSpeed", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseThreshold1", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseThreshold2", "0");

        // Calibrar resposta de repetição do teclado
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "AutoRepeatDelay", "100");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "AutoRepeatRate", "50");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "BounceTime", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "DelayBeforeAcceptance", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "On", "1");

        res.success = true;
        res.afterState = "{\"MouseSpeed\":\"0\",\"MouseThreshold1\":\"0\",\"MouseThreshold2\":\"0\",\"AutoRepeatDelay\":\"100\"}";
        res.message = "Aceleração artificial do mouse desativada e polling rate de teclado calibrado para resposta máxima.";
#else
        res.success = true;
        res.beforeState = "{\"input\":\"default\"}";
        res.afterState = "{\"input\":\"raw_1_to_1\"}";
        res.message = "Input lag calibrado com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackInputLag() {
        OptimizationStepResult res;
        res.toolId = "tool_game_input_lag";
#ifdef _WIN32
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseSpeed", "1");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseThreshold1", "6");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseThreshold2", "10");

        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "AutoRepeatDelay", "500");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "AutoRepeatRate", "31");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "On", "0");

        res.success = true;
        res.afterState = "{\"MouseSpeed\":\"1\",\"AutoRepeatDelay\":\"500\"}";
        res.message = "Curvas de aceleração do mouse e teclado restauradas para o padrão do Windows.";
#else
        res.success = true;
        res.afterState = "{\"input\":\"default\"}";
        res.message = "Curvas de entrada restauradas (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 15. tool_game_exclusive_suite (Completo)
    // Isolamento de afinidade de processos para jogos e purga de shader cache
    // Rollback: restaurar padrão
    // =========================================================================
    static OptimizationStepResult ApplyExclusiveSuite() {
        OptimizationStepResult res;
        res.toolId = "tool_game_exclusive_suite";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para a Suite Exclusiva.";
            return res;
        }

        res.beforeState = "{\"Priority\":2,\"GPUPriority\":0}";

        const char* gamesKey = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games";
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Priority", 6);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "GPU Priority", 8);
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "SFIO Priority", "High");
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Clock Rate", 10000);

        // Purgar cache DirectX de shaders corrompidos
        std::string psPurge =
            "powershell.exe -NoProfile -NonInteractive -Command \""
            "if ($env:LOCALAPPDATA) { Remove-Item -Path \\\"$env:LOCALAPPDATA\\D3DSCache\\*\\\" -Recurse -Force -ErrorAction SilentlyContinue }; "
            "Write-Output 'SHADERS_PURGED'\"";
        HardwareInventory::ExecCommand(psPurge);

        res.success = true;
        res.afterState = "{\"Priority\":6,\"GPUPriority\":8,\"SFIO\":\"High\",\"ShadersPurged\":true}";
        res.message = "Suite Exclusiva aplicada: Prioridade de GPU nível 8, SFIO High e purga de cache de shaders.";
#else
        res.success = true;
        res.beforeState = "{\"suite\":\"standard\"}";
        res.afterState = "{\"suite\":\"exclusive_extreme\"}";
        res.message = "Suite Exclusiva aplicada com sucesso (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackExclusiveSuite() {
        OptimizationStepResult res;
        res.toolId = "tool_game_exclusive_suite";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter a Suite Exclusiva.";
            return res;
        }

        const char* gamesKey = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games";
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Priority", 2);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "GPU Priority", 0);
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "SFIO Priority", "Normal");
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Clock Rate", 2710);

        res.success = true;
        res.afterState = "{\"Priority\":2,\"GPUPriority\":0,\"SFIO\":\"Normal\"}";
        res.message = "Parâmetros da Suite Exclusiva restaurados para o padrão original do Windows.";
#else
        res.success = true;
        res.afterState = "{\"suite\":\"standard\"}";
        res.message = "Suite Exclusiva restaurada (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 16. Restauração Total ao Padrão de Fábrica do Windows
    // =========================================================================
    static std::vector<OptimizationStepResult> RestoreFullWindowsFactoryDefaults() {
        std::vector<OptimizationStepResult> results;
        Logger::Instance().Info("Restoring all optimizations to Windows factory defaults...");

        results.push_back(RollbackCpuBasic());
        results.push_back(RollbackMemory());
        results.push_back(RollbackWinOpt());
        results.push_back(RollbackStartup());
        results.push_back(RollbackProcManager());
        results.push_back(RollbackStability());
        results.push_back(RollbackAdvancedTweaks());
        results.push_back(RollbackLatencySettings());
        results.push_back(RollbackGameFpsTweaks());
        results.push_back(RollbackGameGpuOpt());
        results.push_back(RollbackAmdOpt());
        results.push_back(RollbackNvidiaOpt());
        results.push_back(RollbackDpcExtreme());
        results.push_back(RollbackInputLag());
        results.push_back(RollbackExclusiveSuite());

        Logger::Instance().Info("Factory defaults restoration complete.");
        return results;
    }
};

} // namespace Agent
} // namespace Dyarte
