# Experimental Windows sandbox spike

This native helper is an unverified feasibility spike, not an enabled application feature. It attempts to launch a command in an AppContainer with no declared network capabilities, a curated system-variable environment whose profile directories (USERPROFILE, APPDATA, LOCALAPPDATA, TEMP, TMP) point inside the workspace, a Job Object that owns process-tree cleanup (adapting breakaway to the enclosing job's limits, since a job without JOB_OBJECT_LIMIT_BREAKAWAY_OK makes CREATE_BREAKAWAY_FROM_JOB fail with access denied), and temporary workspace access. The workspace grant combines a DACL entry for the per-run AppContainer SID with a Low mandatory integrity label, because mandatory no-write-up otherwise denies AppContainer writes to an unlabeled directory; both are restored on teardown. A `--probe-launch` mode runs a fixed diagnostic command without the AppContainer attribute to distinguish host launch failures from AppContainer-specific ones; it never takes caller input and never affects the test outcome.

Build and test only on Windows with the MSVC developer environment:

```cmd
build.cmd
powershell -ExecutionPolicy Bypass -File test.ps1 -Executable .\bin\windows-sandbox.exe
```

The tests cover workspace writes, environment credentials, host file reads and writes, and default network denial. A successful Linux sandbox test says nothing about this adapter. The Agent shell tool must remain disabled until this helper passes on supported Windows versions and a review addresses ACL restoration, race behavior, error handling, and packaging.

See the [security ADR](../../docs/adr/0003-security-boundary.md).
