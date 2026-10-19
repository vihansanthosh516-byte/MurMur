# Reliability repair

The audited recording, recovery, learning, navigation, backup, and focus defects are repaired in source.

Verified: 23 Node regression tests, 2 Edge browser integration tests, production frontend build, and `cargo check --locked`. The browser tests use simulated audio and provider replies; they do not measure real microphone accuracy or provider latency. `npm audit` reports no vulnerabilities after updating Vite.

The Rust toolchain is installed by Scoop. Set `RUSTUP_HOME` and `CARGO_HOME` to the `.rustup` and `.cargo` directories under `scoop/apps/rustup/current` when using that installation.

Remaining work: package and launch the repaired Windows build, replace the old installer with the current version, and verify executable metadata. Existing dictionary substitutions require confirmation because old manual and automatically learned entries cannot be distinguished safely. The API keys on this PC remain excluded from exported backups.
