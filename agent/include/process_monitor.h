#pragma once

#include <string>
#include <vector>
#include <sstream>
#include <algorithm>
#include <cstdint>
#include <chrono>
#include "json_helper.h"
#include "logger.h"

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#endif

namespace Dyarte {
namespace Agent {

struct ProcessInfo {
    uint32_t pid = 0;
    std::string name;
    std::string path;
    uint64_t workingSetBytes = 0;
    bool isForeground = false;
    bool isLauncher = false;
    bool isKnownGame = false;
    std::string gameIdentifier;
};

/**
 * Requirement 19: ProcessMonitor
 * Real process enumeration and detection for Windows:
 * - nome
 * - PID
 * - caminho
 * - memória
 * - processo em foreground
 * - processo de jogo quando detectado
 * 
 * Separação estrita:
 * - jogo ativo (FiveM, GTA5, Valorant, CS2, Fortnite, etc.)
 * - launcher (Steam, EpicGamesLauncher, RiotClient, Battle.net, etc.)
 * - processo comum
 * Launchers NUNCA são classificados como jogo ativo.
 */
class ProcessMonitor {
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

    static bool IsLauncherProcess(const std::string& exeName, std::string& outLauncherName) {
        std::string lower = exeName;
        std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });

        if (lower == "steam.exe" || lower.find("steamwebhelper") != std::string::npos) {
            outLauncherName = "Steam";
            return true;
        }
        if (lower.find("epicgameslauncher") != std::string::npos) {
            outLauncherName = "Epic Games Launcher";
            return true;
        }
        if (lower.find("riotclientservices") != std::string::npos) {
            outLauncherName = "Riot Client";
            return true;
        }
        if (lower.find("battle.net") != std::string::npos) {
            outLauncherName = "Battle.net Launcher";
            return true;
        }
        if (lower.find("ubisoftconnect") != std::string::npos) {
            outLauncherName = "Ubisoft Connect";
            return true;
        }
        if (lower.find("galaxyclient") != std::string::npos) {
            outLauncherName = "GOG Galaxy";
            return true;
        }
        if (lower.find("eadesktop") != std::string::npos || lower.find("origin.exe") != std::string::npos) {
            outLauncherName = "EA App";
            return true;
        }
        return false;
    }

    static bool IsGameProcess(const std::string& exeName, std::string& outGameTitle) {
        std::string lower = exeName;
        std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });

        // Launchers are NOT games
        std::string dummy;
        if (IsLauncherProcess(exeName, dummy)) {
            outGameTitle = "";
            return false;
        }

        if (lower.find("fivem") != std::string::npos) {
            outGameTitle = "FiveM";
            return true;
        }
        if (lower.find("gta5") != std::string::npos || lower.find("gtav") != std::string::npos) {
            outGameTitle = "Grand Theft Auto V";
            return true;
        }
        if (lower == "cs2.exe" || lower.find("csgo") != std::string::npos) {
            outGameTitle = "Counter-Strike 2";
            return true;
        }
        if (lower.find("valorant") != std::string::npos) {
            outGameTitle = "Valorant";
            return true;
        }
        if (lower.find("fortnite") != std::string::npos) {
            outGameTitle = "Fortnite";
            return true;
        }
        if (lower.find("r5apex") != std::string::npos) {
            outGameTitle = "Apex Legends";
            return true;
        }
        if (lower.find("league of legends") != std::string::npos || lower == "leagueclientux.exe") {
            outGameTitle = "League of Legends";
            return true;
        }
        if (lower.find("warzone") != std::string::npos || lower.find("cod.exe") != std::string::npos) {
            outGameTitle = "Call of Duty: Warzone";
            return true;
        }
        if (lower.find("overwatch") != std::string::npos) {
            outGameTitle = "Overwatch 2";
            return true;
        }

        outGameTitle = "";
        return false;
    }

    static std::vector<ProcessInfo> GetRunningProcesses(bool includeAll = false) {
        std::vector<ProcessInfo> list;
#ifdef _WIN32
        HWND fgWnd = GetForegroundWindow();
        DWORD fgPid = 0;
        if (fgWnd) {
            GetWindowThreadProcessId(fgWnd, &fgPid);
        }

        HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (hSnap == INVALID_HANDLE_VALUE) {
            return list;
        }

        PROCESSENTRY32W pe32;
        pe32.dwSize = sizeof(PROCESSENTRY32W);

        if (Process32FirstW(hSnap, &pe32)) {
            do {
                if (pe32.th32ProcessID == 0) continue;

                std::wstring wName(pe32.szExeFile);
                std::string exeName(wName.begin(), wName.end());

                std::string launcherName;
                bool isLauncher = IsLauncherProcess(exeName, launcherName);
                std::string gameTitle;
                bool isGame = IsGameProcess(exeName, gameTitle);
                bool isFg = (pe32.th32ProcessID == fgPid);

                // Collect games, launchers, foreground process, or all if requested
                if (includeAll || isGame || isLauncher || isFg) {
                    ProcessInfo info;
                    info.pid = pe32.th32ProcessID;
                    info.name = exeName;
                    info.isForeground = isFg;
                    info.isLauncher = isLauncher;
                    info.isKnownGame = isGame;
                    info.gameIdentifier = isGame ? gameTitle : (isLauncher ? launcherName : "");

                    HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pe32.th32ProcessID);
                    if (hProc) {
                        PROCESS_MEMORY_COUNTERS pmc;
                        if (GetProcessMemoryInfo(hProc, &pmc, sizeof(pmc))) {
                            info.workingSetBytes = pmc.WorkingSetSize;
                        }

                        WCHAR szPath[MAX_PATH];
                        DWORD dwSize = MAX_PATH;
                        if (QueryFullProcessImageNameW(hProc, 0, szPath, &dwSize)) {
                            std::wstring wPath(szPath);
                            info.path = std::string(wPath.begin(), wPath.end());
                        }

                        CloseHandle(hProc);
                    }

                    list.push_back(info);
                }
            } while (Process32NextW(hSnap, &pe32));
        }

        CloseHandle(hSnap);
#endif
        return list;
    }

    static std::string GetActiveGameJson() {
        std::vector<ProcessInfo> procs = GetRunningProcesses(false);
        for (const auto& p : procs) {
            // Strictly real games, not launchers
            if (p.isKnownGame && !p.isLauncher) {
                std::stringstream ss;
                ss << "{"
                   << "\"pid\":" << p.pid << ","
                   << "\"name\":\"" << Escape(p.name) << "\","
                   << "\"title\":\"" << Escape(p.gameIdentifier) << "\","
                   << "\"path\":\"" << Escape(p.path) << "\","
                   << "\"is_foreground\":" << (p.isForeground ? "true" : "false") << ","
                   << "\"memory_mb\":" << (p.workingSetBytes / (1024 * 1024))
                   << "}";
                return ss.str();
            }
        }
        return "null";
    }

    static std::string GetProcessListJson(size_t limit = 20) {
        std::vector<ProcessInfo> procs = GetRunningProcesses(true);
        std::stringstream ss;
        ss << "[";
        size_t count = 0;
        for (size_t i = 0; i < procs.size() && count < limit; ++i) {
            if (count > 0) ss << ",";
            ss << "{"
               << "\"pid\":" << procs[i].pid << ","
               << "\"name\":\"" << Escape(procs[i].name) << "\","
               << "\"is_game\":" << (procs[i].isKnownGame ? "true" : "false") << ","
               << "\"is_launcher\":" << (procs[i].isLauncher ? "true" : "false") << ","
               << "\"game_title\":\"" << Escape(procs[i].gameIdentifier) << "\","
               << "\"is_foreground\":" << (procs[i].isForeground ? "true" : "false") << ","
               << "\"memory_mb\":" << (procs[i].workingSetBytes / (1024 * 1024))
               << "}";
            count++;
        }
        ss << "]";
        return ss.str();
    }
};

} // namespace Agent
} // namespace Dyarte
