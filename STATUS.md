# Reliability repair

The audited recording, recovery, learning, navigation, backup, and focus defects are repaired in source.

Verified: 27 Node regression tests, 2 Edge browser integration tests, production frontend build, `cargo check --locked`, and a complete optimized Windows executable and NSIS installer. Both executable and installer metadata report version 1.1.1. The running process uses the repaired executable in `murmur-build/release`. The browser tests use simulated audio and provider replies; they do not measure real microphone accuracy or provider latency. `npm audit` reports no vulnerabilities after updating Vite.

The Rust toolchain is installed by Scoop. Set `RUSTUP_HOME` and `CARGO_HOME` to the `.rustup` and `.cargo` directories under `scoop/apps/rustup/current` when using that installation.

The current installer is `Murmur_1.1.1_x64-setup.exe` in the project root. The old root installer is archived under `murmur-build/old-installers`. The build helper reads Cargo metadata from `src-tauri` so it finds the same output directory as Tauri. Frontend rebuilds must not run while Rust is embedding frontend assets.

The desktop microphone and shortcut follow-up checks were stopped by the user's physical Escape key. No further desktop automation was performed. A real microphone/voice test remains unverified; Settings → General now provides a local microphone test. Existing dictionary substitutions require confirmation because old manual and automatically learned entries cannot be distinguished safely. API keys remain excluded from exported backups.
