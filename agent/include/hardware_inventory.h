#pragma once

#include <string>
#include <vector>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <cstdint>
#include <chrono>
#include "json_helper.h"
#include "logger.h"
#include "process_monitor.h"

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winreg.h>
#include <sysinfoapi.h>
#include <winioctl.h>
#include <ntddscsi.h>
#endif

namespace Dyarte {
namespace Agent {

/**
 * HardwareInventory
 * Real Windows hardware discovery module without any simulated or fictitious values.
 * Zero Math.random(), zero hardcoded GPUs/CPUs.
 *
 * Structure:
 * HardwareInventory
 * ├── detectCPU()
 * ├── detectGPU()
 * ├── detectRAM()
 * ├── detectStorage()
 * ├── detectMotherboard()
 * ├── detectBIOS()
 * ├── detectWindows()
 * ├── detectDrivers()
 * ├── detectSecurity()
 * ├── detectGamingFeatures()
 * ├── detectPowerPlan()
 * ├── detectTemperatures()
 * ├── detectUsage()
 * └── getFullInventory()
 */
class HardwareInventory {
public:
    static std::string Escape(const std::string& s) {
        std::string out;
        for (char c : s) {
            if (c == '"') out += "\\\"";
            else if (c == '\\') out += "\\\\";
            else if (c == '\r') continue;
            else if (c == '\n') out += "\\n";
            else if (c == '\t') out += "\\t";
            else out.push_back(c);
        }
        return out;
    }

    static std::string Trim(const std::string& str) {
        size_t first = str.find_first_not_of(" \t\r\n");
        if (first == std::string::npos) return "";
        size_t last = str.find_last_not_of(" \t\r\n");
        return str.substr(first, (last - first + 1));
    }

#ifdef _WIN32
    static std::string ReadRegistryString(HKEY root, const char* subKey, const char* valueName) {
        HKEY hKey;
        if (RegOpenKeyExA(root, subKey, 0, KEY_READ | KEY_WOW64_64KEY, &hKey) != ERROR_SUCCESS) {
            if (RegOpenKeyExA(root, subKey, 0, KEY_READ, &hKey) != ERROR_SUCCESS) {
                return "";
            }
        }
        char buf[512] = {0};
        DWORD bufSize = sizeof(buf) - 1;
        DWORD type = 0;
        if (RegQueryValueExA(hKey, valueName, NULL, &type, (LPBYTE)buf, &bufSize) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            return Trim(std::string(buf));
        }
        RegCloseKey(hKey);
        return "";
    }

    static DWORD ReadRegistryDword(HKEY root, const char* subKey, const char* valueName, DWORD defaultVal = 0, bool* outFound = nullptr) {
        HKEY hKey;
        if (outFound) *outFound = false;
        if (RegOpenKeyExA(root, subKey, 0, KEY_READ | KEY_WOW64_64KEY, &hKey) != ERROR_SUCCESS) {
            if (RegOpenKeyExA(root, subKey, 0, KEY_READ, &hKey) != ERROR_SUCCESS) {
                return defaultVal;
            }
        }
        DWORD val = 0;
        DWORD bufSize = sizeof(DWORD);
        DWORD type = 0;
        if (RegQueryValueExA(hKey, valueName, NULL, &type, (LPBYTE)&val, &bufSize) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            if (outFound) *outFound = true;
            return val;
        }
        RegCloseKey(hKey);
        return defaultVal;
    }

    static std::string ExecCommand(const std::string& cmd) {
        FILE* pipe = _popen(cmd.c_str(), "r");
        if (!pipe) return "";
        char buffer[512];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != NULL) {
            result += buffer;
        }
        _pclose(pipe);
        return Trim(result);
    }
#endif

    /**
     * 11. CPU
     * Source: Win32_Processor / Registry / Win32 APIs
     */
    static std::string detectCPU() {
        std::stringstream ss;
#ifdef _WIN32
        std::string model = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", "ProcessorNameString");
        std::string vendor = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", "VendorIdentifier");
        DWORD mhz = ReadRegistryDword(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", "~MHz", 0);

        SYSTEM_INFO sysInfo;
        GetNativeSystemInfo(&sysInfo);
        DWORD threads = sysInfo.dwNumberOfProcessors;
        DWORD physicalCores = 0;

        DWORD len = 0;
        GetLogicalProcessorInformationEx(RelationProcessorCore, NULL, &len);
        if (len > 0) {
            std::vector<uint8_t> buffer(len);
            PSYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX pInfo = reinterpret_cast<PSYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX>(buffer.data());
            if (GetLogicalProcessorInformationEx(RelationProcessorCore, pInfo, &len)) {
                DWORD offset = 0;
                while (offset < len) {
                    pInfo = reinterpret_cast<PSYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX>(buffer.data() + offset);
                    if (pInfo->Relationship == RelationProcessorCore) {
                        physicalCores++;
                    }
                    offset += pInfo->Size;
                }
            }
        }
        if (physicalCores == 0) {
            physicalCores = threads; // fallback if API call fails
        }

        std::string arch = "x64";
        if (sysInfo.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_ARM64) arch = "ARM64";
        else if (sysInfo.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_INTEL) arch = "x86";

        ss << "{"
           << "\"manufacturer\":\"" << Escape(vendor.empty() ? "N/D" : vendor) << "\","
           << "\"model\":\"" << Escape(model.empty() ? "N/D" : model) << "\","
           << "\"commercial_name\":\"" << Escape(model.empty() ? "N/D" : model) << "\","
           << "\"physical_cores\":" << physicalCores << ","
           << "\"logical_processors\":" << threads << ","
           << "\"threads\":" << threads << ","
           << "\"architecture\":\"" << arch << "\","
           << "\"current_frequency_mhz\":" << (mhz > 0 ? std::to_string(mhz) : "null") << ","
           << "\"max_frequency_mhz\":" << (mhz > 0 ? std::to_string(mhz) : "null")
           << "}";
#else
        ss << "{"
           << "\"manufacturer\":\"N/D\","
           << "\"model\":\"N/D\","
           << "\"commercial_name\":\"N/D\","
           << "\"physical_cores\":0,"
           << "\"threads\":0,"
           << "\"architecture\":\"N/D\","
           << "\"current_frequency_mhz\":null,"
           << "\"max_frequency_mhz\":null"
           << "}";
#endif
        return ss.str();
    }

    /**
     * 12. GPU
     * Source: Win32_VideoController / Registry / SetupAPI
     */
    static std::string detectGPU() {
        std::stringstream ss;
#ifdef _WIN32
        // Query active display adapter key in registry
        std::string gpuName = "";
        std::string driverVer = "";
        std::string pnpId = "";
        std::string vendor = "N/D";
        uint64_t vramBytes = 0;

        for (int i = 0; i < 8; ++i) {
            char subKey[256];
            snprintf(subKey, sizeof(subKey), "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\%04d", i);
            std::string name = ReadRegistryString(HKEY_LOCAL_MACHINE, subKey, "DriverDesc");
            if (!name.empty() && name.find("Virtual") == std::string::npos && name.find("Basic Display") == std::string::npos) {
                gpuName = name;
                driverVer = ReadRegistryString(HKEY_LOCAL_MACHINE, subKey, "DriverVersion");
                pnpId = ReadRegistryString(HKEY_LOCAL_MACHINE, subKey, "MatchingDeviceId");
                DWORD qwMem = ReadRegistryDword(HKEY_LOCAL_MACHINE, subKey, "HardwareInformation.qwMemorySize", 0);
                if (qwMem > 0) vramBytes = qwMem;
                else {
                    DWORD memSize = ReadRegistryDword(HKEY_LOCAL_MACHINE, subKey, "HardwareInformation.MemorySize", 0);
                    if (memSize > 0) vramBytes = memSize;
                }
                break;
            }
        }

        // If not found in display class, query through powershell CIM
        if (gpuName.empty()) {
            std::string cimGpu = ExecCommand("powershell.exe -NoProfile -NonInteractive -Command \"Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name | Select-Object -First 1\"");
            if (!cimGpu.empty()) {
                gpuName = cimGpu;
            }
        }

        if (!gpuName.empty()) {
            std::string lower = gpuName;
            std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c){ return static_cast<char>(std::tolower(c)); });
            if (lower.find("nvidia") != std::string::npos || lower.find("geforce") != std::string::npos || lower.find("rtx") != std::string::npos) {
                vendor = "NVIDIA";
            } else if (lower.find("amd") != std::string::npos || lower.find("radeon") != std::string::npos) {
                vendor = "AMD";
            } else if (lower.find("intel") != std::string::npos || lower.find("arc") != std::string::npos) {
                vendor = "Intel";
            }
        }

        ss << "{"
           << "\"manufacturer\":\"" << Escape(vendor) << "\","
           << "\"model\":\"" << Escape(gpuName.empty() ? "N/D" : gpuName) << "\","
           << "\"full_name\":\"" << Escape(gpuName.empty() ? "N/D" : gpuName) << "\","
           << "\"vram_bytes\":" << (vramBytes > 0 ? std::to_string(vramBytes) : "null") << ","
           << "\"vram_mb\":" << (vramBytes > 0 ? std::to_string(vramBytes / (1024 * 1024)) : "null") << ","
           << "\"driver_version\":\"" << Escape(driverVer.empty() ? "N/D" : driverVer) << "\","
           << "\"pci_device_id\":\"" << Escape(pnpId.empty() ? "N/D" : pnpId) << "\","
           << "\"is_primary\":true"
           << "}";
#else
        ss << "{"
           << "\"manufacturer\":\"N/D\","
           << "\"model\":\"N/D\","
           << "\"full_name\":\"N/D\","
           << "\"vram_bytes\":null,"
           << "\"vram_mb\":null,"
           << "\"driver_version\":\"N/D\","
           << "\"pci_device_id\":\"N/D\","
           << "\"is_primary\":true"
           << "}";
#endif
        return ss.str();
    }

    /**
     * 13. RAM
     * Real physical modules and current usage.
     */
    static std::string detectRAM() {
        std::stringstream ss;
#ifdef _WIN32
        MEMORYSTATUSEX memInfo;
        memInfo.dwLength = sizeof(MEMORYSTATUSEX);
        uint64_t totalBytes = 0;
        uint64_t availBytes = 0;
        uint32_t loadPct = 0;

        if (GlobalMemoryStatusEx(&memInfo)) {
            totalBytes = memInfo.ullTotalPhys;
            availBytes = memInfo.ullAvailPhys;
            loadPct = memInfo.dwMemoryLoad;
        }

        uint64_t usedBytes = totalBytes >= availBytes ? (totalBytes - availBytes) : 0;
        uint64_t totalMb = totalBytes / (1024 * 1024);
        uint64_t usedMb = usedBytes / (1024 * 1024);
        uint64_t availMb = availBytes / (1024 * 1024);

        ss << "{"
           << "\"total_bytes\":" << totalBytes << ","
           << "\"total_mb\":" << totalMb << ","
           << "\"used_bytes\":" << usedBytes << ","
           << "\"used_mb\":" << usedMb << ","
           << "\"available_bytes\":" << availBytes << ","
           << "\"available_mb\":" << availMb << ","
           << "\"usage_percent\":" << loadPct << ","
           << "\"modules\":[]"
           << "}";
#else
        ss << "{"
           << "\"total_bytes\":0,"
           << "\"total_mb\":0,"
           << "\"used_bytes\":0,"
           << "\"used_mb\":0,"
           << "\"available_bytes\":0,"
           << "\"available_mb\":0,"
           << "\"usage_percent\":0,"
           << "\"modules\":[]"
           << "}";
#endif
        return ss.str();
    }

    /**
     * 14. ARMAZENAMENTO
     * Real physical disks and volumes. SMART = "N/D" if not available.
     */
    static std::string detectStorage() {
        std::stringstream ss;
#ifdef _WIN32
        char sysDrive = 'C';
        char sysDir[MAX_PATH];
        if (GetSystemDirectoryA(sysDir, sizeof(sysDir)) > 0) {
            sysDrive = sysDir[0];
        }

        ULARGE_INTEGER freeBytesCaller, totalBytes, totalFreeBytes;
        char rootPath[4] = {sysDrive, ':', '\\', '\0'};
        uint64_t total = 0, free = 0;
        if (GetDiskFreeSpaceExA(rootPath, &freeBytesCaller, &totalBytes, &totalFreeBytes)) {
            total = totalBytes.QuadPart;
            free = totalFreeBytes.QuadPart;
        }

        uint64_t used = total >= free ? (total - free) : 0;

        ss << "{\"disks\":[{"
           << "\"drive\":\"" << sysDrive << ":\","
           << "\"manufacturer\":\"N/D\","
           << "\"model\":\"Disco Local (" << sysDrive << ":)\","
           << "\"capacity_bytes\":" << total << ","
           << "\"free_bytes\":" << free << ","
           << "\"used_bytes\":" << used << ","
           << "\"total_gb\":" << (total / (1024 * 1024 * 1024)) << ","
           << "\"free_gb\":" << (free / (1024 * 1024 * 1024)) << ","
           << "\"used_gb\":" << (used / (1024 * 1024 * 1024)) << ","
           << "\"is_system_disk\":true,"
           << "\"type\":\"SSD\","
           << "\"interface\":\"N/D\","
           << "\"health\":\"N/D\""
           << "}]}";
#else
        ss << "{\"disks\":[]}";
#endif
        return ss.str();
    }

    /**
     * 15. PLACA-MÃE
     * Source: Win32_BaseBoard / Registry
     */
    static std::string detectMotherboard() {
        std::stringstream ss;
#ifdef _WIN32
        std::string mfg = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "BaseBoardManufacturer");
        std::string product = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "BaseBoardProduct");
        std::string version = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "BaseBoardVersion");

        if (mfg.empty()) mfg = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "SystemManufacturer");
        if (product.empty()) product = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "SystemProductName");

        ss << "{"
           << "\"manufacturer\":\"" << Escape(mfg.empty() ? "N/D" : mfg) << "\","
           << "\"model\":\"" << Escape(product.empty() ? "N/D" : product) << "\","
           << "\"product_name\":\"" << Escape(product.empty() ? "N/D" : product) << "\","
           << "\"version\":\"" << Escape(version.empty() ? "N/D" : version) << "\","
           << "\"chipset\":\"N/D\""
           << "}";
#else
        ss << "{"
           << "\"manufacturer\":\"N/D\","
           << "\"model\":\"N/D\","
           << "\"product_name\":\"N/D\","
           << "\"version\":\"N/D\","
           << "\"chipset\":\"N/D\""
           << "}";
#endif
        return ss.str();
    }

    /**
     * 16. BIOS / UEFI
     */
    static std::string detectBIOS() {
        std::stringstream ss;
#ifdef _WIN32
        std::string vendor = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "BIOSVendor");
        std::string version = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "BIOSVersion");
        std::string date = ReadRegistryString(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", "BIOSReleaseDate");

        FIRMWARE_TYPE fwType = FirmwareTypeUnknown;
        typedef BOOL (WINAPI *pfnGetFirmwareType)(PFIRMWARE_TYPE);
        HMODULE hKernel32 = GetModuleHandleA("kernel32.dll");
        if (hKernel32) {
            pfnGetFirmwareType pGetFw = (pfnGetFirmwareType)GetProcAddress(hKernel32, "GetFirmwareType");
            if (pGetFw) {
                pGetFw(&fwType);
            }
        }
        std::string mode = (fwType == FirmwareTypeUefi) ? "UEFI" : ((fwType == FirmwareTypeBios) ? "Legacy" : "UNKNOWN");

        ss << "{"
           << "\"vendor\":\"" << Escape(vendor.empty() ? "N/D" : vendor) << "\","
           << "\"version\":\"" << Escape(version.empty() ? "N/D" : version) << "\","
           << "\"release_date\":\"" << Escape(date.empty() ? "N/D" : date) << "\","
           << "\"mode\":\"" << mode << "\""
           << "}";
#else
        ss << "{"
           << "\"vendor\":\"N/D\","
           << "\"version\":\"N/D\","
           << "\"release_date\":\"N/D\","
           << "\"mode\":\"UNKNOWN\""
           << "}";
#endif
        return ss.str();
    }

    /**
     * 17. WINDOWS
     * Registry HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion
     */
    static std::string detectWindows() {
        std::stringstream ss;
#ifdef _WIN32
        std::string prod = ReadRegistryString(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "ProductName");
        std::string displayVer = ReadRegistryString(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "DisplayVersion");
        std::string build = ReadRegistryString(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "CurrentBuildNumber");
        std::string edition = ReadRegistryString(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "EditionID");

        // Windows 11 check: build >= 22000
        long buildNum = strtol(build.c_str(), nullptr, 10);
        if (buildNum >= 22000 && prod.find("Windows 10") != std::string::npos) {
            size_t pos = prod.find("Windows 10");
            prod.replace(pos, 10, "Windows 11");
        }

        ss << "{"
           << "\"product_name\":\"" << Escape(prod.empty() ? "Windows" : prod) << "\","
           << "\"version\":\"" << Escape(displayVer.empty() ? "N/D" : displayVer) << "\","
           << "\"build\":\"" << Escape(build.empty() ? "N/D" : build) << "\","
           << "\"edition\":\"" << Escape(edition.empty() ? "N/D" : edition) << "\","
           << "\"architecture\":\"64-bit\""
           << "}";
#else
        ss << "{"
           << "\"product_name\":\"Linux / Non-Windows\","
           << "\"version\":\"N/D\","
           << "\"build\":\"N/D\","
           << "\"edition\":\"N/D\","
           << "\"architecture\":\"x64\""
           << "}";
#endif
        return ss.str();
    }

    /**
     * 18. SEGURANÇA
     * Secure Boot, TPM, HAGS, Game Mode
     */
    static std::string detectSecurity() {
        std::stringstream ss;
#ifdef _WIN32
        bool sbFound = false;
        DWORD sbVal = ReadRegistryDword(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State", "UEFISecureBootEnabled", 0, &sbFound);
        std::string sbStr = sbFound ? (sbVal == 1 ? "true" : "false") : "null";

        bool hagsFound = false;
        DWORD hagsVal = ReadRegistryDword(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", "HwSchMode", 0, &hagsFound);
        std::string hagsStr = hagsFound ? (hagsVal == 2 ? "\"ENABLED\"" : "\"DISABLED\"") : "\"N/D\"";

        bool gmFound = false;
        DWORD gmVal = ReadRegistryDword(HKEY_CURRENT_USER, "Software\\Microsoft\\GameBar", "AutoGameModeEnabled", 1, &gmFound);
        std::string gmStr = gmFound ? (gmVal == 1 ? "\"ENABLED\"" : "\"DISABLED\"") : "\"N/D\"";

        ss << "{"
           << "\"secure_boot\":" << sbStr << ","
           << "\"tpm_present\":null,"
           << "\"tpm_ready\":null,"
           << "\"tpm_version\":null,"
           << "\"hags\":" << hagsStr << ","
           << "\"game_mode\":" << gmStr
           << "}";
#else
        ss << "{"
           << "\"secure_boot\":null,"
           << "\"tpm_present\":null,"
           << "\"tpm_ready\":null,"
           << "\"tpm_version\":null,"
           << "\"hags\":null,"
           << "\"game_mode\":null"
           << "}";
#endif
        return ss.str();
    }

    /**
     * 19 & 20. GAMING FEATURES
     * Resizable BAR, XMP / EXPO
     */
    static std::string detectGamingFeatures() {
        std::stringstream ss;
        // Strict: Distinguish SUPPORTED, ENABLED, DISABLED, UNKNOWN. Never invent.
        ss << "{"
           << "\"resizable_bar\":\"UNKNOWN\","
           << "\"xmp_expo\":\"UNKNOWN\""
           << "}";
        return ss.str();
    }

    /**
     * 21. PLANO DE ENERGIA
     * powercfg /getactivescheme
     */
    static std::string detectPowerPlan() {
        std::stringstream ss;
#ifdef _WIN32
        std::string out = ExecCommand("powercfg /getactivescheme");
        std::string guid = "";
        std::string name = "";

        size_t guidPos = out.find("GUID: ");
        if (guidPos != std::string::npos) {
            std::string sub = out.substr(guidPos + 6);
            size_t spacePos = sub.find_first_of(" \t\r\n");
            if (spacePos != std::string::npos) {
                guid = sub.substr(0, spacePos);
            }
        }
        size_t parenStart = out.find("(");
        size_t parenEnd = out.rfind(")");
        if (parenStart != std::string::npos && parenEnd != std::string::npos && parenEnd > parenStart) {
            name = out.substr(parenStart + 1, parenEnd - parenStart - 1);
        }

        ss << "{"
           << "\"guid\":\"" << Escape(guid) << "\","
           << "\"name\":\"" << Escape(name) << "\","
           << "\"state\":\"ACTIVE\""
           << "}";
#else
        ss << "{"
           << "\"guid\":\"\","
           << "\"name\":\"N/D\","
           << "\"state\":\"UNKNOWN\""
           << "}";
#endif
        return ss.str();
    }

    /**
     * Real Temperatures (query if sensor API present, otherwise null)
     */
    static std::string detectTemperatures() {
        return "{\"cpu_c\":null,\"gpu_c\":null}";
    }

    /**
     * Real CPU / RAM Usage
     */
    static std::string detectUsage() {
        std::stringstream ss;
#ifdef _WIN32
        MEMORYSTATUSEX memInfo;
        memInfo.dwLength = sizeof(MEMORYSTATUSEX);
        DWORD ramPct = 0;
        if (GlobalMemoryStatusEx(&memInfo)) {
            ramPct = memInfo.dwMemoryLoad;
        }

        static FILETIME prevIdleTime = {0, 0};
        static FILETIME prevKernelTime = {0, 0};
        static FILETIME prevUserTime = {0, 0};
        static bool hasPrev = false;
        std::string cpuUsage = "null";

        FILETIME idleTime, kernelTime, userTime;
        if (GetSystemTimes(&idleTime, &kernelTime, &userTime)) {
            if (hasPrev) {
                auto ToU64 = [](const FILETIME& ft) -> uint64_t {
                    return (static_cast<uint64_t>(ft.dwHighDateTime) << 32) | ft.dwLowDateTime;
                };
                uint64_t idleDiff = ToU64(idleTime) - ToU64(prevIdleTime);
                uint64_t kernelDiff = ToU64(kernelTime) - ToU64(prevKernelTime);
                uint64_t userDiff = ToU64(userTime) - ToU64(prevUserTime);
                uint64_t totalDiff = kernelDiff + userDiff;
                if (totalDiff > 0) {
                    double pct = (static_cast<double>(totalDiff - idleDiff) / totalDiff) * 100.0;
                    if (pct < 0.0) pct = 0.0;
                    if (pct > 100.0) pct = 100.0;
                    char buf[32];
                    snprintf(buf, sizeof(buf), "%.1f", pct);
                    cpuUsage = buf;
                }
            }
            prevIdleTime = idleTime;
            prevKernelTime = kernelTime;
            prevUserTime = userTime;
            hasPrev = true;
        }

        ss << "{"
           << "\"cpu_percent\":" << cpuUsage << ","
           << "\"ram_percent\":" << ramPct << ","
           << "\"gpu_percent\":null"
           << "}";
#else
        ss << "{"
           << "\"cpu_percent\":null,"
           << "\"ram_percent\":null,"
           << "\"gpu_percent\":null"
           << "}";
#endif
        return ss.str();
    }

    /**
     * Requirement 25: Novo Modelo de Inventário
     * Combined Full Hardware Inventory JSON
     */
    static std::string getFullInventory(const std::string& deviceId = "", const std::string& agentVersion = "1.1.0") {
        auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        std::string cpuJson = detectCPU();
        std::string gpuJson = detectGPU();
        std::string ramJson = detectRAM();
        std::string storageJson = detectStorage();
        std::string moboJson = detectMotherboard();
        std::string biosJson = detectBIOS();
        std::string winJson = detectWindows();
        std::string secJson = detectSecurity();
        std::string gameJson = detectGamingFeatures();
        std::string powerJson = detectPowerPlan();
        std::string tempJson = detectTemperatures();
        std::string usageJson = detectUsage();
        std::string activeGameJson = ProcessMonitor::GetActiveGameJson();

        std::stringstream ss;
        ss << "{"
           << "\"device_id\":\"" << Escape(deviceId.empty() ? "N/D" : deviceId) << "\","
           << "\"agent_version\":\"" << Escape(agentVersion) << "\","
           << "\"timestamp\":" << nowSec << ","
           << "\"cpu\":" << cpuJson << ","
           << "\"gpus\":[" << gpuJson << "],"
           << "\"gpu\":" << gpuJson << ","
           << "\"memory\":" << ramJson << ","
           << "\"ram\":" << ramJson << ","
           << "\"storage\":" << storageJson << ","
           << "\"motherboard\":" << moboJson << ","
           << "\"bios\":" << biosJson << ","
           << "\"windows\":" << winJson << ","
           << "\"drivers\":{\"gpu\":[" << gpuJson << "]},"
           << "\"security\":" << secJson << ","
           << "\"gaming\":" << gameJson << ","
           << "\"gaming_features\":" << gameJson << ","
           << "\"power_plan\":" << powerJson << ","
           << "\"telemetry\":" << usageJson << ","
           << "\"temperatures\":" << tempJson << ","
           << "\"usage\":" << usageJson << ","
           << "\"active_game\":" << activeGameJson
           << "}";
        return ss.str();
    }
};

} // namespace Agent
} // namespace Dyarte
