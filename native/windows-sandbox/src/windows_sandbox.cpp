#define UNICODE
#define _UNICODE

#include <Windows.h>
#include <UserEnv.h>
#include <accctrl.h>
#include <aclapi.h>
#include <sddl.h>

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
  HANDLE process = nullptr;
  HANDLE thread = nullptr;
  HANDLE job = nullptr;
  LPPROC_THREAD_ATTRIBUTE_LIST attributes = nullptr;
  std::wstring workspace;
  std::wstring profileName;
  bool aclChanged = false;
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
    if (newDacl) {
      LocalFree(newDacl);
    }
    if (securityDescriptor) {
      LocalFree(securityDescriptor);
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

std::wstring isolatedEnvironment(const std::wstring& workspace) {
  const auto systemRoot = environmentValue(L"SystemRoot");
  const auto comspec = environmentValue(L"ComSpec");
  std::vector<std::wstring> values = {
      L"SystemRoot=" + systemRoot,
      L"ComSpec=" + comspec,
      L"PATH=" + systemRoot + L"\\System32;" + systemRoot + L"\\System32\\WindowsPowerShell\\v1.0",
      L"TEMP=" + workspace,
      L"TMP=" + workspace,
  };
  std::wstring block;
  for (const auto& value : values) {
    block.append(value);
    block.push_back(L'\0');
  }
  block.push_back(L'\0');
  return block;
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
  PROCESS_INFORMATION processInfo = {};
  auto environment = isolatedEnvironment(resources.workspace);
  std::vector<wchar_t> mutableCommand(command.begin(), command.end());
  mutableCommand.push_back(L'\0');

  requireWin32(CreateProcessW(
                   nullptr, mutableCommand.data(), nullptr, nullptr, TRUE,
                   CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT,
                   environment.data(), resources.workspace.c_str(), &startup.StartupInfo, &processInfo),
               "CreateProcessW");
  resources.process = processInfo.hProcess;
  resources.thread = processInfo.hThread;
  requireWin32(AssignProcessToJobObject(resources.job, resources.process), "AssignProcessToJobObject");
  requireWin32(ResumeThread(resources.thread) != static_cast<DWORD>(-1), "ResumeThread");
  requireWin32(WaitForSingleObject(resources.process, INFINITE) != WAIT_FAILED, "WaitForSingleObject");

  DWORD exitCode = 1;
  requireWin32(GetExitCodeProcess(resources.process, &exitCode), "GetExitCodeProcess");
  return exitCode;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc != 5 || std::wstring(argv[1]) != L"--workspace" || std::wstring(argv[3]) != L"--command") {
    std::wcerr << L"Usage: windows-sandbox --workspace <path> --command <command line>\n";
    return 64;
  }

  try {
    Resources resources;
    resources.workspace = argv[2];
    createAppContainer(resources);
    grantWorkspace(resources);
    createJob(resources);
    return static_cast<int>(runIsolated(resources, argv[4]));
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
