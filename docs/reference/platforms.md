# Platform support

## Current targets

- Windows 10 and 11 on x86-64 are release acceptance targets.
- Ubuntu 22.04 and 24.04 LTS on x86-64 are development verification targets.
- Node.js 24 and pnpm 10 are the development toolchain.

Domestic Linux distributions and ARM64 are deferred. A future target requires an explicit device matrix, executable compatibility tests, and sandbox verification.

## External tools

LibreOffice provides the legacy DOC conversion spike through `soffice`. bubblewrap provides the Linux process-isolation spike through `bwrap`. The application must report an unavailable adapter and keep the corresponding capability disabled.

Windows process isolation requires its own verified adapter. Electron renderer sandboxing is not a substitute for shell or script sandboxing. See the [experimental Windows sandbox spike](../../native/windows-sandbox/README.md); its CI result must not be inferred from Linux tests.

## Preview releases

Planned preview packages are unsigned Windows NSIS installers and Linux AppImage/deb artifacts with SHA-256 checksums. Linux also provides a self-extracting `.run` executable for systems without FUSE. It extracts once to the user's versioned cache directory and then starts the cached Electron binary. Production signing and built-in automatic upgrades are not current requirements.

Return to the [reference index](README.md).
