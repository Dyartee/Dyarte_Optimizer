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
    // 1. DEBLOAT WINDOWS 10 (REGISTRY)
    // =========================================================================
    static OptimizationStepResult ApplyDebloatWin10() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_cpu_basic";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para aplicar Debloat do Windows.";
            return res;
        }

        std::string before = "{\"WindowArrangementActive\":\"" + HardwareInventory::ReadRegistryString(HKEY_CURRENT_USER, "Control Panel\\Desktop", "WindowArrangementActive") + "\"}";
        res.beforeState = before;

        // Snap e janelas
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Desktop", "WindowArrangementActive", "0");
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "SnapFill", 0);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "JointResize", 0);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "SnapAssist", 0);

        // Desativar Storage Sense
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy", "01", 0);

        // Forçar modo desktop
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\ImmersiveShell", "SignInMode", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\ImmersiveShell", "TabletMode", 0);

        // Desativar experiências compartilhadas
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\System", "EnableCdp", 0);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\System", "EnableMmx", 0);

        // Tema escuro
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "AppsUseLightTheme", 0);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "SystemUsesLightTheme", 0);

        // Otimização de entrega P2P
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config", "DODownloadMode", 0);

        // MenuShowDelay
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Desktop", "MenuShowDelay", "0");

        // SvcHostSplitThresholdInKB
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control", "SvcHostSplitThresholdInKB", 0x04000000);

        res.success = true;
        res.afterState = "{\"WindowArrangementActive\":\"0\",\"MenuShowDelay\":\"0\",\"SvcHostSplitThresholdInKB\":67108864}";
        res.message = "Debloat do Windows 10 aplicado com sucesso no Registro.";
#else
        res.success = true;
        res.beforeState = "{\"mode\":\"standard\"}";
        res.afterState = "{\"mode\":\"debloated\"}";
        res.message = "Debloat simulado com sucesso (Linux / Container).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackDebloatWin10() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_cpu_basic";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter Debloat do Windows.";
            return res;
        }

        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Desktop", "WindowArrangementActive", "1");
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "SnapFill", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "JointResize", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "SnapAssist", 1);

        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy", "01", 1);

        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\ImmersiveShell", "SignInMode", 0);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\ImmersiveShell", "TabletMode", 0);

        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\System", "EnableCdp", 1);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\System", "EnableMmx", 1);

        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "AppsUseLightTheme", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "SystemUsesLightTheme", 1);

        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config", "DODownloadMode", 1);

        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Desktop", "MenuShowDelay", "400");
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control", "SvcHostSplitThresholdInKB", 0x00380000);

        res.success = true;
        res.afterState = "{\"WindowArrangementActive\":\"1\",\"MenuShowDelay\":\"400\"}";
        res.message = "Debloat do Windows 10 revertido para o padrão de fábrica.";
#else
        res.success = true;
        res.afterState = "{\"mode\":\"standard\"}";
        res.message = "Debloat revertido (Linux / Container).";
#endif
        return res;
    }

    // =========================================================================
    // 2. MMAGENT (MEMORY COMPRESSION)
    // =========================================================================
    static OptimizationStepResult ApplyMMAgent() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_memory";
#ifdef _WIN32
        MEMORYSTATUSEX memInfo;
        memInfo.dwLength = sizeof(MEMORYSTATUSEX);
        uint64_t ramMb = 0;
        if (GlobalMemoryStatusEx(&memInfo)) {
            ramMb = memInfo.ullTotalPhys / (1024 * 1024);
        }

        // Regra estrita: Só aplicar se RAM >= 16 GB (usar dado real do agente)
        if (ramMb < 15000) {
            res.success = false;
            res.errorCode = "INSUFFICIENT_RAM";
            res.message = "A compressão de memória MMAgent só deve ser desativada em sistemas com 16 GB de RAM ou mais. Memória detectada: " + std::to_string(ramMb / 1024) + " GB.";
            return res;
        }

        std::string cmdOut = HardwareInventory::ExecCommand("powershell.exe -NoProfile -NonInteractive -Command \"try { Disable-MMAgent -mc -ErrorAction Stop; 'SUCCESS' } catch { 'ERROR' }\"");
        if (cmdOut.find("SUCCESS") != std::string::npos) {
            res.success = true;
            res.beforeState = "{\"MemoryCompression\":true}";
            res.afterState = "{\"MemoryCompression\":false}";
            res.message = "MMAgent Memory Compression desativado com sucesso (RAM >= 16GB).";
        } else {
            res.success = false;
            res.errorCode = "COMMAND_FAILED";
            res.message = "Falha ao executar Disable-MMAgent no PowerShell.";
        }
#else
        res.success = true;
        res.beforeState = "{\"MemoryCompression\":true}";
        res.afterState = "{\"MemoryCompression\":false}";
        res.message = "MMAgent desativado (simulação ambiente não-Windows).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackMMAgent() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_memory";
#ifdef _WIN32
        std::string cmdOut = HardwareInventory::ExecCommand("powershell.exe -NoProfile -NonInteractive -Command \"try { Enable-MMAgent -mc -ErrorAction Stop; 'SUCCESS' } catch { 'ERROR' }\"");
        res.success = (cmdOut.find("SUCCESS") != std::string::npos);
        res.afterState = "{\"MemoryCompression\":true}";
        res.message = res.success ? "MMAgent Memory Compression reativado para o padrão." : "Falha ao reativar MMAgent.";
#else
        res.success = true;
        res.afterState = "{\"MemoryCompression\":true}";
        res.message = "MMAgent reativado (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 3. INPUT / RESPONSIVIDADE (REGISTRO)
    // =========================================================================
    static OptimizationStepResult ApplyInputResponsiveness() {
        OptimizationStepResult res;
        res.toolId = "tool_game_input_lag";
#ifdef _WIN32
        // Acessibilidade Keyboard Response
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "AutoRepeatDelay", "100");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "AutoRepeatRate", "50");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "BounceTime", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "DelayBeforeAcceptance", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "On", "1");

        // Flags de acessibilidade
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\StickyKeys", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\HighContrast", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\MouseKeys", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\TimeOut", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\ToggleKeys", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\SoundSentry", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Preference", "On", "1");

        // Control Panel Keyboard
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Keyboard", "InitialKeyboardIndicators", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Keyboard", "KeyboardDelay", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Keyboard", "KeyboardSpeed", "31");

        // Control Panel Desktop
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Desktop", "MenuShowDelay", "0");

        // Control Panel Mouse
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "ActiveWindowTracking", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "DoubleClickSpeed", "200");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseHoverTime", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseSpeed", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseThreshold1", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseThreshold2", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseTrails", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "SnapToDefaultButton", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "SwapMouseButtons", "0");

        res.success = true;
        res.beforeState = "{\"KeyboardSpeed\":\"padrão\",\"MouseSpeed\":\"padrão\"}";
        res.afterState = "{\"AutoRepeatDelay\":\"100\",\"AutoRepeatRate\":\"50\",\"KeyboardSpeed\":\"31\"}";
        res.message = "Ajustes de Input Lag e Responsividade aplicados com sucesso.";
#else
        res.success = true;
        res.beforeState = "{\"input\":\"default\"}";
        res.afterState = "{\"input\":\"low_latency\"}";
        res.message = "Ajustes de Input Lag aplicados (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackInputResponsiveness() {
        OptimizationStepResult res;
        res.toolId = "tool_game_input_lag";
#ifdef _WIN32
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "AutoRepeatDelay", "500");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "AutoRepeatRate", "31");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "BounceTime", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "DelayBeforeAcceptance", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Response", "On", "0");

        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\StickyKeys", "Flags", "510");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\HighContrast", "Flags", "122");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\MouseKeys", "Flags", "62");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\TimeOut", "Flags", "62");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\ToggleKeys", "Flags", "62");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\SoundSentry", "Flags", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Accessibility\\Keyboard Preference", "On", "1");

        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Keyboard", "InitialKeyboardIndicators", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Keyboard", "KeyboardDelay", "1");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Keyboard", "KeyboardSpeed", "31");

        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Desktop", "MenuShowDelay", "400");

        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "ActiveWindowTracking", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "DoubleClickSpeed", "500");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseHoverTime", "400");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseSpeed", "1");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseThreshold1", "6");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseThreshold2", "10");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "MouseTrails", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "SnapToDefaultButton", "0");
        AdminHelper::WriteString(HKEY_CURRENT_USER, "Control Panel\\Mouse", "SwapMouseButtons", "0");

        res.success = true;
        res.afterState = "{\"KeyboardSpeed\":\"31\",\"MouseSpeed\":\"1\"}";
        res.message = "Configurações de Input e periféricos revertidas ao padrão de fábrica.";
#else
        res.success = true;
        res.afterState = "{\"input\":\"default\"}";
        res.message = "Configurações de Input revertidas (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 4. BCDEDIT TWEAKS (ADMIN)
    // =========================================================================
    static OptimizationStepResult ApplyBcdeditTweaks() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_latency_settings";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para executar comandos BCDEDIT e FSUTIL.";
            return res;
        }

        // [1/5] fsutil behavior set memoryusage 2
        HardwareInventory::ExecCommand("fsutil behavior set memoryusage 2");
        // [2/5] bcdedit /set useplatformtick yes
        HardwareInventory::ExecCommand("bcdedit /set useplatformtick yes");
        // [3/5] bcdedit /set disabledynamictick yes
        HardwareInventory::ExecCommand("bcdedit /set disabledynamictick yes");
        // [4/5] fsutil behavior set disablelastaccess 1 && netsh int ip set global taskoffload=enabled
        HardwareInventory::ExecCommand("fsutil behavior set disablelastaccess 1");
        HardwareInventory::ExecCommand("netsh int ip set global taskoffload=enabled");
        // [5/5] sfc /scannow (Background safe verification)
        HardwareInventory::ExecCommand("powershell.exe -NoProfile -NonInteractive -Command \"Start-Process -FilePath sfc -ArgumentList '/scannow' -NoNewWindow -Wait -ErrorAction SilentlyContinue\"");

        res.success = true;
        res.beforeState = "{\"useplatformtick\":\"no\",\"disabledynamictick\":\"no\"}";
        res.afterState = "{\"useplatformtick\":\"yes\",\"disabledynamictick\":\"yes\",\"memoryusage\":2,\"disablelastaccess\":1}";
        res.message = "Tweaks BCDEDIT e otimizações de latência aplicadas [5/5]. Reinicialização recomendada.";
#else
        res.success = true;
        res.beforeState = "{\"bcd\":\"standard\"}";
        res.afterState = "{\"bcd\":\"optimized\"}";
        res.message = "Tweaks BCDEDIT simulados com sucesso (Linux / Container).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackBcdeditTweaks() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_latency_settings";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter BCDEDIT e FSUTIL.";
            return res;
        }

        HardwareInventory::ExecCommand("bcdedit /set useplatformtick no");
        HardwareInventory::ExecCommand("bcdedit /set disabledynamictick no");
        HardwareInventory::ExecCommand("fsutil behavior set memoryusage 0");
        HardwareInventory::ExecCommand("fsutil behavior set disablelastaccess 0");
        HardwareInventory::ExecCommand("netsh int ip set global taskoffload=disabled");

        res.success = true;
        res.afterState = "{\"useplatformtick\":\"no\",\"disabledynamictick\":\"no\",\"memoryusage\":0,\"disablelastaccess\":0}";
        res.message = "BCDEDIT e parâmetros de disco revertidos para o padrão original do Windows.";
#else
        res.success = true;
        res.afterState = "{\"bcd\":\"standard\"}";
        res.message = "BCDEDIT revertido (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 5. PERFORMANCE REGISTRY TWEAKS (PLANO COMPLETO)
    // =========================================================================
    static OptimizationStepResult ApplyCompletePerformanceTweaks() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_dpc_extreme";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para aplicar tweaks de desempenho avançados.";
            return res;
        }

        // GPU_SCHEDULER_MODE = 47
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "GPU_SCHEDULER_MODE", "47");

        // NoAutoUpdate = 1
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", "NoAutoUpdate", 1);

        // GlobalTimerResolutionRequests = 1
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel", "GlobalTimerResolutionRequests", 1);

        // Tasks Games
        const char* gamesKey = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games";
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Affinity", 0);
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Background Only", "False");
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Clock Rate", 10000);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "GPU Priority", 8);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Priority", 6);
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Scheduling Category", "High");
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "SFIO Priority", "High");
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Latency Sensitive", "True");

        // Win32PrioritySeparation = 0x26 (38)
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\PriorityControl", "Win32PrioritySeparation", 0x26);

        // Multimedia SystemProfile
        const char* sysProfKey = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile";
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, sysProfKey, "NetworkThrottlingIndex", 0xffffffff);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, sysProfKey, "SystemResponsiveness", 0xa);

        // StartupDelayInMSec = 0
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", "StartupDelayInMSec", 0);

        // GameDVR / GameBar
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR", "AllowGameDVR", 0);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", "UseNexusForGameBarEnabled", 0);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", "AutoGameModeEnabled", 1);

        // Dwm OverlayTestMode = 5
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\Dwm", "OverlayTestMode", 5);

        res.success = true;
        res.beforeState = "{\"Win32PrioritySeparation\":2,\"SystemResponsiveness\":20}";
        res.afterState = "{\"Win32PrioritySeparation\":38,\"SystemResponsiveness\":10,\"NetworkThrottlingIndex\":-1,\"OverlayTestMode\":5}";
        res.message = "Tweaks de Desempenho Extremo do Registro aplicados com sucesso.";
#else
        res.success = true;
        res.beforeState = "{\"perf\":\"standard\"}";
        res.afterState = "{\"perf\":\"extreme\"}";
        res.message = "Tweaks de desempenho aplicados (simulação).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackCompletePerformanceTweaks() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_dpc_extreme";
#ifdef _WIN32
        if (!AdminHelper::IsProcessElevated()) {
            res.success = false;
            res.errorCode = "ELEVATION_REQUIRED";
            res.message = "Privilégios de Administrador são obrigatórios para reverter tweaks de desempenho.";
            return res;
        }

        AdminHelper::DeleteValue(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "GPU_SCHEDULER_MODE");
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", "NoAutoUpdate", 0);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel", "GlobalTimerResolutionRequests", 0);

        const char* gamesKey = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games";
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Affinity", 0);
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Background Only", "True");
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Clock Rate", 2710);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "GPU Priority", 0);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, gamesKey, "Priority", 2);
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Scheduling Category", "Medium");
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "SFIO Priority", "Normal");
        AdminHelper::WriteString(HKEY_LOCAL_MACHINE, gamesKey, "Latency Sensitive", "False");

        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\PriorityControl", "Win32PrioritySeparation", 2);

        const char* sysProfKey = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile";
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, sysProfKey, "NetworkThrottlingIndex", 10);
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, sysProfKey, "SystemResponsiveness", 20);

        AdminHelper::DeleteValue(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", "StartupDelayInMSec");
        AdminHelper::WriteDword(HKEY_LOCAL_MACHINE, "SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR", "AllowGameDVR", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", "UseNexusForGameBarEnabled", 1);
        AdminHelper::WriteDword(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", "AutoGameModeEnabled", 0);
        AdminHelper::DeleteValue(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\Dwm", "OverlayTestMode");

        res.success = true;
        res.afterState = "{\"Win32PrioritySeparation\":2,\"SystemResponsiveness\":20,\"NetworkThrottlingIndex\":10}";
        res.message = "Tweaks de registro revertidos para o padrão original do Windows.";
#else
        res.success = true;
        res.afterState = "{\"perf\":\"standard\"}";
        res.message = "Tweaks de desempenho revertidos (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 6. PLANO DE ENERGIA OTIMIZADO (Dyarte.pow)
    // =========================================================================
    static OptimizationStepResult ApplyDyartePowerPlan(const std::string& powerPlanPath = "power-plans\\Dyarte.pow") {
        OptimizationStepResult res;
        res.toolId = "tool_perf_power_plan";
#ifdef _WIN32
        // Importa plano da pasta power-plans/Dyarte.pow
        std::string importCmd = "powercfg /import \"" + powerPlanPath + "\"";
        std::string importOut = HardwareInventory::ExecCommand(importCmd);
        Logger::Instance().Info("powercfg import result: " + importOut);

        // Extrai GUID da saída do import ou busca na listagem
        std::string importedGuid;
        std::regex guidRegex("([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})");
        std::smatch match;
        if (std::regex_search(importOut, match, guidRegex)) {
            importedGuid = match.str(1);
        } else {
            // Se o import não retornou diretamente, busca em powercfg /list
            std::string listOut = HardwareInventory::ExecCommand("powercfg /list");
            std::stringstream ss(listOut);
            std::string line;
            while (std::getline(ss, line)) {
                if (line.find("Dyarte") != std::string::npos || line.find("DYARTE") != std::string::npos) {
                    if (std::regex_search(line, match, guidRegex)) {
                        importedGuid = match.str(1);
                        break;
                    }
                }
            }
        }

        // Se o import funcionou ou se usamos o GUID fixo do Dyarte.pow
        if (importedGuid.empty()) {
            importedGuid = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
        }

        std::string setActiveCmd = "powercfg /setactive " + importedGuid;
        HardwareInventory::ExecCommand(setActiveCmd);

        res.success = true;
        res.beforeState = "{\"guid\":\"SCHEME_BALANCED\"}";
        res.afterState = "{\"guid\":\"" + importedGuid + "\",\"name\":\"DYARTE Extreme Gaming & Latency\"}";
        res.message = "Plano de energia Dyarte.pow importado e ativado com sucesso.";
#else
        res.success = true;
        res.beforeState = "{\"guid\":\"standard\"}";
        res.afterState = "{\"guid\":\"8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c\"}";
        res.message = "Plano de energia simulado (Linux / Container).";
#endif
        return res;
    }

    static OptimizationStepResult RollbackDyartePowerPlan() {
        OptimizationStepResult res;
        res.toolId = "tool_perf_power_plan";
#ifdef _WIN32
        // Restaura para o plano Equilibrado do Windows (SCHEME_BALANCED / SCHEME_MIN)
        HardwareInventory::ExecCommand("powercfg /setactive SCHEME_MIN");
        res.success = true;
        res.afterState = "{\"guid\":\"SCHEME_MIN\",\"name\":\"Equilibrado / Balanced\"}";
        res.message = "Plano de energia original do Windows restaurado com sucesso.";
#else
        res.success = true;
        res.afterState = "{\"guid\":\"SCHEME_MIN\"}";
        res.message = "Plano de energia restaurado (simulação).";
#endif
        return res;
    }

    // =========================================================================
    // 7. RESTAURAÇÃO TOTAL AO PADRÃO DE FÁBRICA
    // =========================================================================
    static std::vector<OptimizationStepResult> RestoreFullWindowsFactoryDefaults() {
        std::vector<OptimizationStepResult> results;
        Logger::Instance().Info("Restoring all optimizations to Windows factory defaults...");

        results.push_back(RollbackDebloatWin10());
        results.push_back(RollbackMMAgent());
        results.push_back(RollbackInputResponsiveness());
        results.push_back(RollbackBcdeditTweaks());
        results.push_back(RollbackCompletePerformanceTweaks());
        results.push_back(RollbackDyartePowerPlan());

        Logger::Instance().Info("Factory defaults restoration complete.");
        return results;
    }
};

} // namespace Agent
} // namespace Dyarte
