#define UNICODE
#define _UNICODE

#include <Windows.h>
#include <UserEnv.h>
#include <accctrl.h>
#include <aclapi.h>
#include <sddl.h>

#include <algorithm>
#include <cwctype>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#pragma comment(lib, "Advapi32.lib")
#pragma comment(lib, "Userenv.lib")

namespace {
struct Resources {
  PSID appContainerSid = nullptr;
  PACL oldDacl = nullptr;
  PACL newDacl = nullptr;
  PSECURITY_DESCRIPTOR securityDescriptor = nullptr;
  PACL oldLabelSacl = nullptr;
  PSECURITY_DESCRIPTOR oldLabelDescriptor = nullptr;
  HANDLE process = nullptr;
  HANDLE thread = nullptr;
  HANDLE job = nullptr;
  LPPROC_THREAD_ATTRIBUTE_LIST attributes = nullptr;
  std::wstring workspace;
  std::wstring profileName;
  bool aclChanged = false;
  bool labelChanged = false;
  bool profileCreated = false;

  ~Resources() {
    if (process) {
      CloseHandle(process);
    }
    if (thread) {
      CloseHandle(thread);
    }
    if (job) {
      CloseHandle(job);
    }
    if (attributes) {
      DeleteProcThreadAttributeList(attributes);
      LocalFree(attributes);
    }
    if (aclChanged) {
      SetNamedSecurityInfoW(
          const_cast<LPWSTR>(workspace.c_str()), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
          nullptr, nullptr, oldDacl, nullptr);
    }
    if (labelChanged) {
      SetNamedSecurityInfoW(const_cast<LPWSTR>(workspace.c_str()), SE_FILE_OBJECT,
                            LABEL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, oldLabelSacl);
    }
    if (newDacl) {
      LocalFree(newDacl);
    }
    if (securityDescriptor) {
      LocalFree(securityDescriptor);
    }
    if (oldLabelDescriptor) {
      LocalFree(oldLabelDescriptor);
    }
    if (!profileName.empty()) {
      DeleteAppContainerProfile(profileName.c_str());
    }
    if (appContainerSid) {
      FreeSid(appContainerSid);
    }
  }
};

void requireWin32(BOOL result, const char* operation) {
  if (!result) {
    throw std::runtime_error(std::string(operation) + " failed with error " +
                             std::to_string(GetLastError()));
  }
}

void requireHresult(HRESULT result, const char* operation) {
  if (FAILED(result)) {
    throw std::runtime_error(std::string(operation) + " failed with HRESULT " +
                             std::to_string(static_cast<unsigned long>(result)));
  }
}

std::wstring environmentValue(const wchar_t* name) {
  const auto size = GetEnvironmentVariableW(name, nullptr, 0);
  if (size == 0) {
    return L"";
  }
  std::wstring value(size, L'\0');
  GetEnvironmentVariableW(name, value.data(), size);
  value.resize(size - 1);
  return value;
}

// Windows documents the environment block as sorted, and AppContainer launches
// derive a package environment on top of it: a minimal block without the
// standard system and profile variables made CreateProcessW fail with
// ERROR_ENVVAR_NOT_FOUND on the CI runner. Keep the set curated: only
// non-secret system values and per-run sandbox directories, never inherited
// user variables.
std::vector<std::wstring> systemEnvironmentValues() {
  std::wstring systemRoot = environmentValue(L"SystemRoot");
  if (systemRoot.empty()) {
    systemRoot = L"C:\\Windows";
  }
  return {
      L"ComSpec=" + environmentValue(L"ComSpec"),
      L"PATH=" + systemRoot + L"\\System32;" + systemRoot + L"\\System32\\WindowsPowerShell\\v1.0",
      L"PATHEXT=.COM;.EXE;.BAT;.CMD",
      L"SystemDrive=" + systemRoot.substr(0, 2),
      L"SystemRoot=" + systemRoot,
      L"windir=" + systemRoot,
  };
}

std::wstring serializeEnvironment(std::vector<std::wstring> values) {
  values.erase(std::remove_if(values.begin(), values.end(),
                              [](const std::wstring& value) { return value.back() == L'='; }),
               values.end());
  const auto upper = [](std::wstring value) {
    for (auto& ch : value) {
      ch = static_cast<wchar_t>(std::towupper(ch));
    }
    return value;
  };
  std::sort(values.begin(), values.end(),
            [&](const std::wstring& left, const std::wstring& right) {
              return upper(left) < upper(right);
            });
  std::wstring block;
  for (const auto& value : values) {
    block.append(value);
    block.push_back(L'\0');
  }
  block.push_back(L'\0');
  return block;
}

// The profile directories live inside the workspace so they inherit the
// AppContainer DACL grant and Low integrity label.
std::wstring prepareProfile(const std::wstring& workspace) {
  const std::wstring profile = workspace + L"\\profile";
  const std::wstring appData = profile + L"\\AppData";
  for (const auto& path : {profile, appData, appData + L"\\Roaming", appData + L"\\Local"}) {
    if (!CreateDirectoryW(path.c_str(), nullptr) && GetLastError() != ERROR_ALREADY_EXISTS) {
      throw std::runtime_error("CreateDirectoryW failed with error " +
                               std::to_string(GetLastError()));
    }
  }
  return profile;
}

// Profile variables point inside the granted workspace tree so the sandboxed
// process can actually use them; they never reference the host user profile.
std::wstring isolatedEnvironment(const std::wstring& workspace, const std::wstring& profile) {
  auto values = systemEnvironmentValues();
  values.push_back(L"TEMP=" + workspace);
  values.push_back(L"TMP=" + workspace);
  values.push_back(L"USERPROFILE=" + profile);
  values.push_back(L"APPDATA=" + profile + L"\\AppData\\Roaming");
  values.push_back(L"LOCALAPPDATA=" + profile + L"\\AppData\\Local");
  if (profile.size() > 2 && profile[1] == L':') {
    values.push_back(L"HOMEDRIVE=" + profile.substr(0, 2));
    values.push_back(L"HOMEPATH=" + profile.substr(2));
  }
  // A custom block is responsible for the per-drive current-directory entries
  // when lpCurrentDirectory is set; the launch derives them from the block.
  if (workspace.size() > 2 && workspace[1] == L':') {
    values.push_back(L"=" + workspace.substr(0, 2) + L"=" + workspace);
  }
  return serializeEnvironment(std::move(values));
}

std::wstring probeEnvironment() {
  return serializeEnvironment(systemEnvironmentValues());
}

// The block is built only from the curated system values above, so dumping it
// on failure cannot leak host secrets.
std::string describeEnvironment(const std::wstring& block) {
  std::string description;
  std::wstring entry;
  for (const wchar_t ch : block) {
    if (ch == L'\0') {
      if (!entry.empty()) {
        if (!description.empty()) {
          description += "; ";
        }
        for (const wchar_t unit : entry) {
          description += unit < 128 ? static_cast<char>(unit) : '?';
        }
        entry.clear();
      }
    } else {
      entry.push_back(ch);
    }
  }
  return description;
}

void createAppContainer(Resources& resources) {
  resources.profileName = L"OfficeAgent.Sandbox." + std::to_wstring(GetCurrentProcessId()) + L"." +
                          std::to_wstring(GetTickCount64());
  HRESULT result = CreateAppContainerProfile(
      resources.profileName.c_str(), L"Office Agent Sandbox", L"Experimental workspace isolation",
      nullptr, 0, &resources.appContainerSid);
  if (result == HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS)) {
    result = DeriveAppContainerSidFromAppContainerName(resources.profileName.c_str(),
                                                       &resources.appContainerSid);
  } else if (SUCCEEDED(result)) {
    resources.profileCreated = true;
  }
  requireHresult(result, "CreateAppContainerProfile");
}

void grantWorkspace(Resources& resources) {
  requireWin32(GetNamedSecurityInfoW(
                   resources.workspace.c_str(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, nullptr,
                   nullptr, &resources.oldDacl, nullptr, &resources.securityDescriptor) == ERROR_SUCCESS,
               "GetNamedSecurityInfoW");

  EXPLICIT_ACCESS_W access = {};
  access.grfAccessPermissions = GENERIC_ALL;
  access.grfAccessMode = GRANT_ACCESS;
  access.grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
  access.Trustee.TrusteeForm = TRUSTEE_IS_SID;
  access.Trustee.TrusteeType = TRUSTEE_IS_UNKNOWN;
  access.Trustee.ptstrName = reinterpret_cast<LPWCH>(resources.appContainerSid);
  requireWin32(SetEntriesInAclW(1, &access, resources.oldDacl, &resources.newDacl) == ERROR_SUCCESS,
               "SetEntriesInAclW");
  requireWin32(SetNamedSecurityInfoW(
                   const_cast<LPWSTR>(resources.workspace.c_str()), SE_FILE_OBJECT,
                   DACL_SECURITY_INFORMATION, nullptr, nullptr, resources.newDacl,
                   nullptr) == ERROR_SUCCESS,
               "SetNamedSecurityInfoW");
  resources.aclChanged = true;
}

// AppContainer tokens run at Low integrity, and mandatory no-write-up denies their
// writes to unlabeled (implicit Medium) directories even when the DACL grants them.
// Label the workspace Low with inheritance so the sandboxed process can write it,
// and restore the original label on teardown.
void grantWorkspaceLabel(Resources& resources) {
  const DWORD read = GetNamedSecurityInfoW(
      resources.workspace.c_str(), SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, nullptr, nullptr,
      nullptr, &resources.oldLabelSacl, &resources.oldLabelDescriptor);
  if (read != ERROR_SUCCESS) {
    resources.oldLabelSacl = nullptr;
    resources.oldLabelDescriptor = nullptr;
  }

  PSECURITY_DESCRIPTOR label = nullptr;
  requireWin32(ConvertStringSecurityDescriptorToSecurityDescriptorW(
                   L"S:(ML;OICI;NW;;;LW)", SDDL_REVISION_1, &label, nullptr),
               "ConvertStringSecurityDescriptorToSecurityDescriptorW");
  PACL sacl = nullptr;
  BOOL present = FALSE;
  BOOL defaulted = FALSE;
  const BOOL gotSacl = GetSecurityDescriptorSacl(label, &present, &sacl, &defaulted);
  requireWin32(gotSacl && present, "GetSecurityDescriptorSacl");
  requireWin32(SetNamedSecurityInfoW(const_cast<LPWSTR>(resources.workspace.c_str()),
                                     SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, nullptr, nullptr,
                                     nullptr, sacl) == ERROR_SUCCESS,
               "SetNamedSecurityInfoW(LABEL)");
  LocalFree(label);
  resources.labelChanged = true;
}

void createJob(Resources& resources) {
  resources.job = CreateJobObjectW(nullptr, nullptr);
  if (!resources.job) {
    throw std::runtime_error("CreateJobObjectW failed");
  }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  requireWin32(SetInformationJobObject(resources.job, JobObjectExtendedLimitInformation, &limits,
                                       sizeof(limits)),
               "SetInformationJobObject");
}

// A runner that places this process in a job without JOB_OBJECT_LIMIT_BREAKAWAY_OK
// makes CreateProcessW fail with ERROR_ACCESS_DENIED when the breakaway flag is
// passed, so only request breakaway when the enclosing job grants it. A silent
// breakaway job needs no flag, and for a restrictive job the caller retries with
// the flag as a last resort.
DWORD breakawayFlag() {
  BOOL inJob = FALSE;
  if (!IsProcessInJob(GetCurrentProcess(), nullptr, &inJob) || !inJob) {
    return 0;
  }
  JOBOBJECT_BASIC_LIMIT_INFORMATION limits = {};
  if (!QueryInformationJobObject(nullptr, JobObjectBasicLimitInformation, &limits, sizeof(limits),
                                 nullptr)) {
    return 0;
  }
  if (limits.LimitFlags & JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK) {
    return 0;
  }
  if (limits.LimitFlags & JOB_OBJECT_LIMIT_BREAKAWAY_OK) {
    return CREATE_BREAKAWAY_FROM_JOB;
  }
  return 0;
}

void launchSuspended(Resources& resources, STARTUPINFOEXW& startup, std::wstring& environment,
                     const std::wstring& command, DWORD creationFlags) {
  std::vector<wchar_t> mutableCommand(command.begin(), command.end());
  mutableCommand.push_back(L'\0');
  PROCESS_INFORMATION processInfo = {};
  if (!CreateProcessW(nullptr, mutableCommand.data(), nullptr, nullptr, TRUE, creationFlags,
                      environment.data(), resources.workspace.c_str(), &startup.StartupInfo,
                      &processInfo)) {
    throw std::runtime_error("CreateProcessW failed with error " + std::to_string(GetLastError()) +
                             " using environment block: " + describeEnvironment(environment));
  }
  resources.process = processInfo.hProcess;
  resources.thread = processInfo.hThread;
}

void terminateSuspended(Resources& resources) {
  if (resources.process) {
    TerminateProcess(resources.process, 1);
    CloseHandle(resources.process);
    resources.process = nullptr;
  }
  if (resources.thread) {
    CloseHandle(resources.thread);
    resources.thread = nullptr;
  }
}

DWORD runIsolated(Resources& resources, const std::wstring& command) {
  SECURITY_CAPABILITIES capabilities = {};
  capabilities.AppContainerSid = resources.appContainerSid;

  SIZE_T attributeSize = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &attributeSize);
  resources.attributes = static_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(LocalAlloc(LMEM_ZEROINIT, attributeSize));
  if (!resources.attributes) {
    throw std::runtime_error("LocalAlloc failed");
  }
  requireWin32(InitializeProcThreadAttributeList(resources.attributes, 1, 0, &attributeSize),
               "InitializeProcThreadAttributeList");
  requireWin32(UpdateProcThreadAttribute(resources.attributes, 0,
                                         PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, &capabilities,
                                         sizeof(capabilities), nullptr, nullptr),
               "UpdateProcThreadAttribute");

  STARTUPINFOEXW startup = {};
  startup.StartupInfo.cb = sizeof(startup);
  startup.lpAttributeList = resources.attributes;
  const auto profile = prepareProfile(resources.workspace);
  auto environment = isolatedEnvironment(resources.workspace, profile);

  const DWORD baseFlags = CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT;
  const DWORD launchFlags = baseFlags | breakawayFlag();
  launchSuspended(resources, startup, environment, command, launchFlags);
  if (!AssignProcessToJobObject(resources.job, resources.process)) {
    const DWORD firstError = GetLastError();
    terminateSuspended(resources);
    if (launchFlags & CREATE_BREAKAWAY_FROM_JOB) {
      throw std::runtime_error("AssignProcessToJobObject failed with error " +
                               std::to_string(firstError));
    }
    try {
      launchSuspended(resources, startup, environment, command,
                      baseFlags | CREATE_BREAKAWAY_FROM_JOB);
    } catch (const std::exception& error) {
      throw std::runtime_error("AssignProcessToJobObject failed with error " +
                               std::to_string(firstError) +
                               "; breakaway relaunch also failed: " + error.what());
    }
    if (!AssignProcessToJobObject(resources.job, resources.process)) {
      const DWORD secondError = GetLastError();
      terminateSuspended(resources);
      throw std::runtime_error("AssignProcessToJobObject failed with error " +
                               std::to_string(firstError) + " without breakaway and " +
                               std::to_string(secondError) + " with breakaway");
    }
  }
  requireWin32(ResumeThread(resources.thread) != static_cast<DWORD>(-1), "ResumeThread");
  requireWin32(WaitForSingleObject(resources.process, INFINITE) != WAIT_FAILED, "WaitForSingleObject");

  DWORD exitCode = 1;
  requireWin32(GetExitCodeProcess(resources.process, &exitCode), "GetExitCodeProcess");
  return exitCode;
}

// Diagnostic only: launch a fixed no-write command without the AppContainer
// attribute to distinguish host launch failures from AppContainer-specific
// ones. The command is hardcoded and never comes from caller input.
DWORD probeLaunch() {
  auto environment = probeEnvironment();
  std::wstring command = L"cmd.exe /d /c cd";
  std::vector<wchar_t> mutableCommand(command.begin(), command.end());
  mutableCommand.push_back(L'\0');
  STARTUPINFOW startup = {};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION processInfo = {};
  if (!CreateProcessW(nullptr, mutableCommand.data(), nullptr, nullptr, FALSE,
                      CREATE_UNICODE_ENVIRONMENT, environment.data(), nullptr, &startup,
                      &processInfo)) {
    throw std::runtime_error("probe CreateProcessW failed with error " +
                             std::to_string(GetLastError()) +
                             " using environment block: " + describeEnvironment(environment));
  }
  requireWin32(WaitForSingleObject(processInfo.hProcess, INFINITE) != WAIT_FAILED,
               "WaitForSingleObject");
  DWORD exitCode = 1;
  requireWin32(GetExitCodeProcess(processInfo.hProcess, &exitCode), "GetExitCodeProcess");
  CloseHandle(processInfo.hThread);
  CloseHandle(processInfo.hProcess);
  return exitCode;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && std::wstring(argv[1]) == L"--probe-launch") {
    try {
      const DWORD code = probeLaunch();
      std::cerr << "probe launch: child exit code " << code << '\n';
      return static_cast<int>(code);
    } catch (const std::exception& error) {
      std::cerr << error.what() << '\n';
      return 1;
    }
  }
  if (argc != 5 || std::wstring(argv[1]) != L"--workspace" || std::wstring(argv[3]) != L"--command") {
    std::wcerr << L"Usage: windows-sandbox --workspace <path> --command <command line>\n"
                  L"       windows-sandbox --probe-launch\n";
    return 64;
  }

  try {
    Resources resources;
    resources.workspace = argv[2];
    createAppContainer(resources);
    grantWorkspace(resources);
    grantWorkspaceLabel(resources);
    createJob(resources);
    return static_cast<int>(runIsolated(resources, argv[4]));
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
