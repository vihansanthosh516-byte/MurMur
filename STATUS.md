# Reliability repair

The audited recording, recovery, learning, navigation, backup, and focus defects are repaired in source.

Verified for 1.1.1: 27 Node regression tests, 2 Edge browser integration tests, production frontend build, `cargo check --locked`, and a complete optimized Windows executable and NSIS installer. Both executable and installer metadata report version 1.1.1. The browser tests use simulated audio and provider replies; they do not measure real microphone accuracy or provider latency. `npm audit` reports no vulnerabilities after updating Vite.

The Rust toolchain is installed by Scoop. Set `RUSTUP_HOME` and `CARGO_HOME` to the `.rustup` and `.cargo` directories under `scoop/apps/rustup/current` when using that installation.

The current installer is `Murmur_1.1.1_x64-setup.exe` in the project root. The old root installer is archived under `murmur-build/old-installers`. The build helper reads Cargo metadata from `src-tauri` so it finds the same output directory as Tauri. Frontend rebuilds must not run while Rust is embedding frontend assets.

Existing dictionary substitutions require confirmation because old manual and automatically learned entries cannot be distinguished safely. API keys remain excluded from exported backups.

## Clipboard and hardware follow-up (1.1.2)

The real microphone test opened the Realtek SoundWire microphone array and detected a 37% peak. A subsequent desktop check found the installed 1.1.0 executable running, despite the separate 1.1.1 build. The installed copy must also be updated so normal launches use the fixes.

Synchronous native clipboard commands could block Murmur's WebView until after the original clipboard was restored. Paste, selection copy, and key commands now run on a serialized worker. Clipboard restoration preserves text or images and avoids replacing text copied during the pending paste. Settings → General adds an exact Unicode insertion and selection-copy test that uses no audio or API requests.

Version 1.1.2 passes all 27 Node tests, `cargo check --locked`, and the optimized Windows executable and NSIS installer build. The installed 1.1.0 copy has been backed up and replaced with 1.1.2. The real native insertion test passed: `Murmur insertion test. தமிழ் 123.` was pasted exactly and copied from the selected textarea. Ctrl+Space quick tap started hands-free, Escape cancelled, and Ctrl+Shift+Space started/stopped recording. The real speech provider transcript matched the pasted text exactly, confirming the clipboard substitution is fixed. However, the user's test phrase was recognized as “My microphone is 1, 2, 3.” This was already wrong in the raw provider result. Live previews are temporarily disabled for these checks and must be restored afterward.

## Hold-only and accuracy follow-up (1.1.3)

The user requests only Ctrl+Space held while speaking. Quick release now stops or cancels recording, including a release while the microphone is still opening; it never switches to hands-free. New settings and the reset button register only Ctrl+Space. Optional hands-free and command shortcuts can still be assigned. Recording status is visible on all main pages, including Scratchpad.

The default speech model is now full Whisper Large v3. Older settings migration no longer forces Turbo. This PC is configured with full v3, English, and only Ctrl+Space. English is still selectable alongside other supported languages in Settings. All 29 Node tests and the frontend build pass. Native packaging, installed-copy replacement, and a same-clip accuracy comparison are in progress.
