#pragma once

#include <string>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <winreg.h>
#include <shlobj.h>

namespace Dyarte {
namespace Agent {

class AdminHelper {
public:
    /**
     * Checks if the current process is running with elevated Administrator privileges.
     */
    static bool IsProcessElevated() {
        BOOL isElevated = FALSE;
        HANDLE hToken = NULL;
        if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken)) {
            TOKEN_ELEVATION elevation;
            DWORD cbSize = sizeof(TOKEN_ELEVATION);
            if (GetTokenInformation(hToken, TokenElevation, &elevation, sizeof(elevation), &cbSize)) {
                isElevated = elevation.TokenIsElevated != 0;
            }
            CloseHandle(hToken);
        }
        return isElevated != FALSE;
    }

    /**
     * Attempts to relaunch the agent with elevated Administrator privileges via UAC.
     */
    static bool RequestElevation(const std::string& args = "") {
        char exePath[MAX_PATH];
        if (GetModuleFileNameA(NULL, exePath, MAX_PATH) == 0) return false;

        SHELLEXECUTEINFOA sei = { sizeof(sei) };
        sei.lpVerb = "runas";
        sei.lpFile = exePath;
        sei.lpParameters = args.empty() ? NULL : args.c_str();
        sei.nShow = SW_NORMAL;
        return ShellExecuteExA(&sei) == TRUE;
    }

    /**
     * Registry write helpers for deterministic optimization application & rollback
     */
    static bool WriteDword(HKEY root, const char* subKey, const char* valueName, DWORD data) {
        HKEY hKey;
        if (RegCreateKeyExA(root, subKey, 0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE | KEY_WOW64_64KEY, NULL, &hKey, NULL) != ERROR_SUCCESS) {
            if (RegCreateKeyExA(root, subKey, 0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL) != ERROR_SUCCESS) {
                return false;
            }
        }
        LSTATUS status = RegSetValueExA(hKey, valueName, 0, REG_DWORD, (const BYTE*)&data, sizeof(DWORD));
        RegCloseKey(hKey);
        return status == ERROR_SUCCESS;
    }

    static bool WriteString(HKEY root, const char* subKey, const char* valueName, const std::string& data) {
        HKEY hKey;
        if (RegCreateKeyExA(root, subKey, 0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE | KEY_WOW64_64KEY, NULL, &hKey, NULL) != ERROR_SUCCESS) {
            if (RegCreateKeyExA(root, subKey, 0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL) != ERROR_SUCCESS) {
                return false;
            }
        }
        LSTATUS status = RegSetValueExA(hKey, valueName, 0, REG_SZ, (const BYTE*)data.c_str(), (DWORD)(data.length() + 1));
        RegCloseKey(hKey);
        return status == ERROR_SUCCESS;
    }

    static bool DeleteValue(HKEY root, const char* subKey, const char* valueName) {
        HKEY hKey;
        if (RegOpenKeyExA(root, subKey, 0, KEY_WRITE | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS ||
            RegOpenKeyExA(root, subKey, 0, KEY_WRITE, &hKey) == ERROR_SUCCESS) {
            LSTATUS s = RegDeleteValueA(hKey, valueName);
            RegCloseKey(hKey);
            return s == ERROR_SUCCESS;
        }
        return false;
    }
};

} // namespace Agent
} // namespace Dyarte

#else

namespace Dyarte {
namespace Agent {

class AdminHelper {
public:
    static bool IsProcessElevated() { return true; }
    static bool RequestElevation(const std::string& = "") { return true; }
};

} // namespace Agent
} // namespace Dyarte

#endif
