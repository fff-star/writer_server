# Experimental Windows sandbox spike

This native helper is an unverified feasibility spike, not an enabled application feature. It attempts to launch a command in an AppContainer with no declared network capabilities, a curated system-variable environment, a Job Object that owns process-tree cleanup, and temporary workspace access. The workspace grant combines a DACL entry for the per-run AppContainer SID with a Low mandatory integrity label, because mandatory no-write-up otherwise denies AppContainer writes to an unlabeled directory; both are restored on teardown.

Build and test only on Windows with the MSVC developer environment:

```cmd
build.cmd
powershell -ExecutionPolicy Bypass -File test.ps1 -Executable .\bin\windows-sandbox.exe
```

The tests cover workspace writes, environment credentials, host file reads and writes, and default network denial. A successful Linux sandbox test says nothing about this adapter. The Agent shell tool must remain disabled until this helper passes on supported Windows versions and a review addresses ACL restoration, race behavior, error handling, and packaging.

See the [security ADR](../../docs/adr/0003-security-boundary.md).
