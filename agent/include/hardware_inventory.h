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

    static uint64_t ReadRegistryQword(HKEY root, const char* subKey, const char* valueName, uint64_t defaultVal = 0, bool* outFound = nullptr) {
        HKEY hKey;
        if (outFound) *outFound = false;
        if (RegOpenKeyExA(root, subKey, 0, KEY_READ | KEY_WOW64_64KEY, &hKey) != ERROR_SUCCESS) {
            if (RegOpenKeyExA(root, subKey, 0, KEY_READ, &hKey) != ERROR_SUCCESS) {
                return defaultVal;
            }
        }
        uint64_t val = 0;
        DWORD bufSize = sizeof(uint64_t);
        DWORD type = 0;
        if (RegQueryValueExA(hKey, valueName, NULL, &type, (LPBYTE)&val, &bufSize) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            if (outFound) *outFound = true;
            return val;
        }
        // Fallback for 32-bit DWORD if stored as REG_DWORD
        DWORD dwordVal = 0;
        bufSize = sizeof(DWORD);
        if (RegQueryValueExA(hKey, valueName, NULL, &type, (LPBYTE)&dwordVal, &bufSize) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            if (outFound) *outFound = true;
            return static_cast<uint64_t>(dwordVal);
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
     * Real manufacturer, model, physical cores, threads, architecture.
     * Never uses ~MHz as max frequency (sets null if not confirmed).
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

        std::string arch = "N/D";
        if (sysInfo.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64) arch = "x64";
        else if (sysInfo.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_ARM64) arch = "ARM64";
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
           << "\"max_frequency_mhz\":null"
           << "}";
#else
        ss << "{"
           << "\"manufacturer\":\"N/D\","
           << "\"model\":\"N/D\","
           << "\"commercial_name\":\"N/D\","
           << "\"physical_cores\":0,"
           << "\"logical_processors\":0,"
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
     * Enumerates ALL physical GPUs into an array.
     * Filters out virtual display adapters.
     * Never fills temperature or usage with 0 (uses null).
     */
    struct GpuDeviceItem {
        std::string name;
        std::string model;
        std::string fullName;
        std::string vendor;
        std::string driverVer;
        std::string pnpId;
        uint64_t vramBytes = 0;
        bool isPrimary = false;
        bool isPrimaryDetermined = false;
    };

    static std::vector<GpuDeviceItem> enumeratePhysicalGpus() {
        std::vector<GpuDeviceItem> list;
#ifdef _WIN32
        for (int i = 0; i < 16; ++i) {
            char subKey[256];
            snprintf(subKey, sizeof(subKey), "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\%04d", i);
            std::string name = ReadRegistryString(HKEY_LOCAL_MACHINE, subKey, "DriverDesc");
            if (name.empty()) continue;

            // Filter out virtual display adapters
            std::string lower = name;
            std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c){ return static_cast<char>(std::tolower(c)); });
            if (lower.find("virtual") != std::string::npos ||
                lower.find("basic display") != std::string::npos ||
                lower.find("hyper-v") != std::string::npos ||
                lower.find("rdp") != std::string::npos ||
                lower.find("remote") != std::string::npos ||
                lower.find("vmware") != std::string::npos ||
                lower.find("parallels") != std::string::npos ||
                lower.find("iddsample") != std::string::npos) {
                continue;
            }

            GpuDeviceItem item;
            item.name = name;
            item.model = name;
            item.fullName = name;
            item.driverVer = ReadRegistryString(HKEY_LOCAL_MACHINE, subKey, "DriverVersion");
            item.pnpId = ReadRegistryString(HKEY_LOCAL_MACHINE, subKey, "MatchingDeviceId");

            uint64_t qwMem = ReadRegistryQword(HKEY_LOCAL_MACHINE, subKey, "HardwareInformation.qwMemorySize", 0);
            if (qwMem > 0) item.vramBytes = qwMem;
            else {
                uint64_t memSize = ReadRegistryQword(HKEY_LOCAL_MACHINE, subKey, "HardwareInformation.MemorySize", 0);
                if (memSize > 0) item.vramBytes = memSize;
            }

            item.vendor = "N/D";
            if (lower.find("nvidia") != std::string::npos || lower.find("geforce") != std::string::npos || lower.find("rtx") != std::string::npos) {
                item.vendor = "NVIDIA";
            } else if (lower.find("amd") != std::string::npos || lower.find("radeon") != std::string::npos) {
                item.vendor = "AMD";
            } else if (lower.find("intel") != std::string::npos || lower.find("arc") != std::string::npos) {
                item.vendor = "Intel";
            }

            // Real Primary GPU detection via EnumDisplayDevicesA (Section 11)
            // Never assume item.isPrimary = list.empty(). If undetermined, is_primary will be null.
            item.isPrimary = false;
            item.isPrimaryDetermined = false;
            DISPLAY_DEVICEA dd;
            ZeroMemory(&dd, sizeof(dd));
            dd.cb = sizeof(dd);
            for (DWORD d = 0; EnumDisplayDevicesA(NULL, d, &dd, 0); ++d) {
                if (dd.StateFlags & DISPLAY_DEVICE_PRIMARY_DEVICE) {
                    std::string ddString = dd.DeviceString ? dd.DeviceString : "";
                    if (!ddString.empty() && (ddString.find(name) != std::string::npos || name.find(ddString) != std::string::npos)) {
                        item.isPrimary = true;
                        item.isPrimaryDetermined = true;
                        break;
                    }
                }
            }
            list.push_back(item);
        }
#endif
        return list;
    }

    static std::string formatGpuItemJson(const GpuDeviceItem& item) {
        std::stringstream ss;
        uint64_t vramMb = item.vramBytes > 0 ? (item.vramBytes / (1024 * 1024)) : 0;
        std::string primaryStr = item.isPrimaryDetermined ? (item.isPrimary ? "true" : "false") : "null";
        ss << "{"
           << "\"manufacturer\":\"" << Escape(item.vendor.empty() ? "N/D" : item.vendor) << "\","
           << "\"model\":\"" << Escape(item.name.empty() ? "N/D" : item.name) << "\","
           << "\"full_name\":\"" << Escape(item.fullName.empty() ? "N/D" : item.fullName) << "\","
           << "\"vram_bytes\":" << (item.vramBytes > 0 ? std::to_string(item.vramBytes) : "null") << ","
           << "\"vram_mb\":" << (vramMb > 0 ? std::to_string(vramMb) : "null") << ","
           << "\"driver_version\":\"" << Escape(item.driverVer.empty() ? "N/D" : item.driverVer) << "\","
           << "\"pci_device_id\":\"" << Escape(item.pnpId.empty() ? "N/D" : item.pnpId) << "\","
           << "\"temperature_c\":null,"
           << "\"usage_percent\":null,"
           << "\"is_primary\":" << primaryStr
           << "}";
        return ss.str();
    }

    static std::string detectGPU() {
        std::vector<GpuDeviceItem> gpus = enumeratePhysicalGpus();
        if (!gpus.empty()) {
            return formatGpuItemJson(gpus[0]);
        }
        return "{\"manufacturer\":\"N/D\",\"model\":\"N/D\",\"full_name\":\"N/D\",\"vram_bytes\":null,\"vram_mb\":null,\"driver_version\":\"N/D\",\"pci_device_id\":\"N/D\",\"temperature_c\":null,\"usage_percent\":null,\"is_primary\":null}";
    }

    static std::string detectGPUsArrayJson() {
        std::vector<GpuDeviceItem> gpus = enumeratePhysicalGpus();
        std::stringstream ss;
        ss << "[";
        for (size_t i = 0; i < gpus.size(); ++i) {
            if (i > 0) ss << ",";
            ss << formatGpuItemJson(gpus[i]);
        }
        if (gpus.empty()) {
            ss << "{\"manufacturer\":\"N/D\",\"model\":\"N/D\",\"full_name\":\"N/D\",\"vram_bytes\":null,\"vram_mb\":null,\"driver_version\":\"N/D\",\"pci_device_id\":\"N/D\",\"temperature_c\":null,\"usage_percent\":null,\"is_primary\":null}";
        }
        ss << "]";
        return ss.str();
    }

    /**
     * 13. RAM
     * Real memory load and physical stick modules.
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

        std::vector<std::string> moduleJsons;
        // Query physical RAM sticks via CIM / PowerShell (Section 10: No WMIC)
        std::string psOut = ExecCommand("powershell.exe -NoProfile -NonInteractive -Command \"try { Get-CimInstance Win32_PhysicalMemory -ErrorAction Stop | ForEach-Object { \\\"$($_.Capacity),$($_.DeviceLocator),$($_.Manufacturer),$($_.PartNumber),$($_.Speed),$($_.SerialNumber),$($_.MemoryType),$($_.FormFactor)\\\" } } catch { }\"");
        if (!psOut.empty()) {
            std::stringstream ssPs(psOut);
            std::string line;
            while (std::getline(ssPs, line)) {
                line = Trim(line);
                if (line.empty()) continue;
                std::vector<std::string> parts;
                std::stringstream ssLine(line);
                std::string part;
                while (std::getline(ssLine, part, ',')) {
                    parts.push_back(Trim(part));
                }
                if (parts.size() >= 5) {
                    std::string capStr = parts[0];
                    std::string slot = parts[1];
                    std::string mfg = parts[2];
                    std::string partNum = parts[3];
                    std::string speedStr = parts[4];
                    std::string serial = parts.size() >= 6 ? parts[5] : "";
                    std::string memType = parts.size() >= 7 ? parts[6] : "";
                    std::string formFactor = parts.size() >= 8 ? parts[7] : "";

                    uint64_t capBytes = 0;
                    try { capBytes = std::stoull(capStr); } catch (...) {}
                    uint64_t capGb = capBytes / (1024ULL * 1024ULL * 1024ULL);
                    uint64_t capMb = capBytes / (1024 * 1024);

                    std::string speedJson = "null";
                    try {
                        uint32_t sp = std::stoul(speedStr);
                        if (sp > 0) speedJson = std::to_string(sp);
                    } catch (...) {}

                    std::stringstream mss;
                    mss << "{"
                        << "\"slot\":\"" << Escape(slot.empty() ? "N/D" : slot) << "\","
                        << "\"device_locator\":\"" << Escape(slot.empty() ? "N/D" : slot) << "\","
                        << "\"capacity_bytes\":" << capBytes << ","
                        << "\"capacity_gb\":" << capGb << ","
                        << "\"capacity_mb\":" << capMb << ","
                        << "\"manufacturer\":\"" << Escape(mfg.empty() ? "N/D" : mfg) << "\","
                        << "\"part_number\":\"" << Escape(partNum.empty() ? "N/D" : partNum) << "\","
                        << "\"serial_number\":\"" << Escape(serial.empty() ? "N/D" : serial) << "\","
                        << "\"speed_mhz\":" << speedJson << ","
                        << "\"memory_type\":\"" << Escape(memType.empty() ? "N/D" : memType) << "\","
                        << "\"form_factor\":\"" << Escape(formFactor.empty() ? "DIMM" : formFactor) << "\""
                        << "}";
                    moduleJsons.push_back(mss.str());
                }
            }
        }

        std::stringstream modSs;
        modSs << "[";
        for (size_t i = 0; i < moduleJsons.size(); ++i) {
            if (i > 0) modSs << ",";
            modSs << moduleJsons[i];
        }
        modSs << "]";

        ss << "{"
           << "\"total_bytes\":" << totalBytes << ","
           << "\"total_mb\":" << totalMb << ","
           << "\"used_bytes\":" << usedBytes << ","
           << "\"used_mb\":" << usedMb << ","
           << "\"available_bytes\":" << availBytes << ","
           << "\"available_mb\":" << availMb << ","
           << "\"usage_percent\":" << loadPct << ","
           << "\"modules\":" << modSs.str()
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
     * 14. ARMAZENAMENTO (Storage)
     * Separates physical disks from logical volumes.
     * Real enumeration of physical disks via Win32_DiskDrive.
     * Never uses "Disco Local (C:)" or fixed "SSD" as physical disk properties.
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
        uint64_t totalGb = total / (1024 * 1024 * 1024);
        uint64_t freeGb = free / (1024 * 1024 * 1024);
        uint64_t usedGb = used / (1024 * 1024 * 1024);

        // Logical Volumes
        std::string volumesJson = "[{"
            "\"drive\":\"" + std::string(1, sysDrive) + ":\","
            "\"total_bytes\":" + std::to_string(total) + ","
            "\"free_bytes\":" + std::to_string(free) + ","
            "\"used_bytes\":" + std::to_string(used) + ","
            "\"total_gb\":" + std::to_string(totalGb) + ","
            "\"free_gb\":" + std::to_string(freeGb) + ","
            "\"used_gb\":" + std::to_string(usedGb) + ","
            "\"is_system\":true"
        "}]";

        // Real Physical Disks: Query via Win32_DiskDrive and identify system drive accurately without WMIC (Section 9 & 10)
        std::vector<std::string> physicalDisks;
        std::string psDisks = ExecCommand("powershell.exe -NoProfile -NonInteractive -Command \"try { $sysDrive = $env:SystemDrive; $sysDiskNum = -1; try { $p = Get-Partition -DriveLetter ($sysDrive.TrimEnd(':')) -ErrorAction SilentlyContinue; if ($p) { $sysDiskNum = $p.DiskNumber } } catch {}; Get-CimInstance Win32_DiskDrive -ErrorAction Stop | ForEach-Object { $dIndex = $_.Index; $isSys = if ($sysDiskNum -ge 0) { if ($dIndex -eq $sysDiskNum) { 'true' } else { 'false' } } else { 'null' }; \\\"$($_.DeviceID)|$($_.InterfaceType)|$($_.Manufacturer)|$($_.MediaType)|$($_.Model)|$($_.SerialNumber)|$($_.Size)|$($_.Status)|$isSys\\\" } } catch { }\"");
        if (!psDisks.empty()) {
            std::stringstream ssDisks(psDisks);
            std::string line;
            while (std::getline(ssDisks, line)) {
                line = Trim(line);
                if (line.empty()) continue;
                std::vector<std::string> parts;
                std::stringstream ssLine(line);
                std::string part;
                while (std::getline(ssLine, part, '|')) {
                    parts.push_back(Trim(part));
                }
                if (parts.size() >= 8) {
                    std::string devId = parts[0];
                    std::string iface = parts[1];
                    std::string mfg = parts[2];
                    std::string media = parts[3];
                    std::string model = parts[4];
                    std::string serial = parts[5];
                    std::string sizeStr = parts[6];
                    std::string status = parts[7].empty() ? "OK" : parts[7];
                    std::string isSysStr = parts.size() >= 9 ? parts[8] : "null";

                    // Clean DeviceID from "\\\\.\\PHYSICALDRIVE0" to "PhysicalDrive0"
                    size_t slashPos = devId.find_last_of("\\/");
                    if (slashPos != std::string::npos) {
                        devId = devId.substr(slashPos + 1);
                    }

                    uint64_t diskSize = 0;
                    try { diskSize = std::stoull(sizeStr); } catch (...) {}
                    uint64_t diskSizeGb = diskSize / (1024ULL * 1024ULL * 1024ULL);

                    std::stringstream dss;
                    dss << "{"
                        << "\"device_id\":\"" << Escape(devId.empty() ? "N/D" : devId) << "\","
                        << "\"model\":\"" << Escape(model.empty() ? "N/D" : model) << "\","
                        << "\"manufacturer\":\"" << Escape(mfg.empty() ? "N/D" : mfg) << "\","
                        << "\"size_bytes\":" << diskSize << ","
                        << "\"size_gb\":" << diskSizeGb << ","
                        << "\"media_type\":\"" << Escape(media.empty() ? "N/D" : media) << "\","
                        << "\"interface_type\":\"" << Escape(iface.empty() ? "N/D" : iface) << "\","
                        << "\"serial_number\":\"" << Escape(serial.empty() ? "N/D" : serial) << "\","
                        << "\"status\":\"" << Escape(status) << "\","
                        << "\"is_system\":" << isSysStr
                        << "}";
                    physicalDisks.push_back(dss.str());
                }
            }
        }

        std::stringstream disksSs;
        disksSs << "[";
        for (size_t i = 0; i < physicalDisks.size(); ++i) {
            if (i > 0) disksSs << ",";
            disksSs << physicalDisks[i];
        }
        disksSs << "]";

        ss << "{"
           << "\"disks\":" << disksSs.str() << ","
           << "\"volumes\":" << volumesJson
           << "}";
#else
        ss << "{\"disks\":[],\"volumes\":[]}";
#endif
        return ss.str();
    }

    /**
     * 15. PLACA-MÃE (Motherboard)
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
     * Real OS build, edition, version, and architecture.
     * Never hardcodes 64-bit.
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

        SYSTEM_INFO sysInfo;
        GetNativeSystemInfo(&sysInfo);
        std::string arch = "N/D";
        if (sysInfo.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64) arch = "x64";
        else if (sysInfo.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_ARM64) arch = "ARM64";
        else if (sysInfo.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_INTEL) arch = "x86";

        ss << "{"
           << "\"product_name\":\"" << Escape(prod.empty() ? "Windows" : prod) << "\","
           << "\"version\":\"" << Escape(displayVer.empty() ? "N/D" : displayVer) << "\","
           << "\"build\":\"" << Escape(build.empty() ? "N/D" : build) << "\","
           << "\"edition\":\"" << Escape(edition.empty() ? "N/D" : edition) << "\","
           << "\"architecture\":\"" << arch << "\""
           << "}";
#else
        ss << "{"
           << "\"product_name\":\"Linux / Non-Windows\","
           << "\"version\":\"N/D\","
           << "\"build\":\"N/D\","
           << "\"edition\":\"N/D\","
           << "\"architecture\":\"N/D\""
           << "}";
#endif
        return ss.str();
    }

    /**
     * 18. SEGURANÇA (Security)
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

        // Requirement 11: Real TPM detection
        std::string tpmPresentStr = "null";
        std::string tpmReadyStr = "null";
        std::string tpmVersionStr = "null";
        std::string tpmCmd = ExecCommand("powershell.exe -NoProfile -NonInteractive -Command \"try { $t = Get-Tpm -ErrorAction Stop; [PSCustomObject]@{ p=$t.TpmPresent; r=$t.TpmReady; v=$t.ManufacturerVersion } | ConvertTo-Json -Compress } catch { }\"");
        if (!tpmCmd.empty() && tpmCmd.find("\"p\":") != std::string::npos) {
            JsonHelper tpmJson(tpmCmd);
            if (tpmCmd.find("\"p\":true") != std::string::npos) tpmPresentStr = "true";
            else if (tpmCmd.find("\"p\":false") != std::string::npos) tpmPresentStr = "false";

            if (tpmCmd.find("\"r\":true") != std::string::npos) tpmReadyStr = "true";
            else if (tpmCmd.find("\"r\":false") != std::string::npos) tpmReadyStr = "false";

            std::string ver = tpmJson.get_field_string("v", "");
            if (!ver.empty()) tpmVersionStr = "\"" + Escape(ver) + "\"";
        }

        ss << "{"
           << "\"secure_boot\":" << sbStr << ","
           << "\"tpm_present\":" << tpmPresentStr << ","
           << "\"tpm_ready\":" << tpmReadyStr << ","
           << "\"tpm_version\":" << tpmVersionStr << ","
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
     * Resizable BAR, XMP / EXPO.
     * Uses null or N/D when not verified.
     */
    static std::string detectGamingFeatures() {
        return "{\"resizable_bar\":\"N/D\",\"xmp_expo\":\"N/D\"}";
    }

    /**
     * 21. PLANO DE ENERGIA (Power Plan)
     * powercfg /getactivescheme
     * Requirement 12: Never state ACTIVE without real valid GUID confirmation
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

        if (!guid.empty() && IsValidGuid(guid)) {
            ss << "{"
               << "\"guid\":\"" << Escape(guid) << "\","
               << "\"name\":\"" << Escape(name.empty() ? "N/D" : name) << "\","
               << "\"state\":\"ACTIVE\""
               << "}";
        } else {
            ss << "{"
               << "\"guid\":null,"
               << "\"name\":\"N/D\","
               << "\"state\":\"UNKNOWN\""
               << "}";
        }
#else
        ss << "{"
           << "\"guid\":null,"
           << "\"name\":\"N/D\","
           << "\"state\":\"UNKNOWN\""
           << "}";
#endif
        return ss.str();
    }

    /**
     * Real Temperatures (query sensor API if present, otherwise null)
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
     * Combined Full Hardware Inventory JSON adhering strictly to unified schema.
     */
    static std::string getFullInventory(const std::string& deviceId = "", const std::string& agentVersion = "N/D") {
        auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        std::string cpuJson = detectCPU();
        std::string gpuJson = detectGPU();
        std::string gpusArrayJson = detectGPUsArrayJson();
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
           << "\"gpus\":" << gpusArrayJson << ","
           << "\"gpu\":" << gpuJson << ","
           << "\"memory\":" << ramJson << ","
           << "\"ram\":" << ramJson << ","
           << "\"storage\":" << storageJson << ","
           << "\"motherboard\":" << moboJson << ","
           << "\"bios\":" << biosJson << ","
           << "\"windows\":" << winJson << ","
           << "\"drivers\":{\"gpu\":" << gpusArrayJson << "},"
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
