# Murmur

A Windows dictation app built with Tauri and React. Murmur has no subscription; online providers have their own usage limits and billing.

## Use

Add a Groq or Deepgram API key in Settings, or download an offline speech model. Groq also provides AI cleanup, commands, translation, and meeting summaries. Without Groq, dictation, dictionary replacements, snippets, and basic line breaks still work.

The initial talk shortcut is `Ctrl+Space`: hold to record, then release to transcribe and insert. A quick tap never starts hands-free recording. Optional hands-free and command shortcuts can be set in Settings → Shortcuts. If another app owns a shortcut, retry after closing that app or choose **Use alternate shortcuts**. All key hints follow the saved shortcuts.

Settings → General → **Test microphone** opens the selected microphone for two seconds and reports its signal level. It sends no audio to a provider.

Recordings and raw transcripts are retained when transcription, AI cleanup, or pasting fails. Recover them from history. Meeting recordings continue when navigating between pages. Backups in Settings → Data include audio and exclude API keys; restoring keeps the keys already on the current PC.

Edits teach vocabulary, not automatic substitutions. Review older substitutions in Dictionary and click **Confirm replacement** only for mappings you want applied to every future dictation. Speaker muting affects all audio, including calls, and is off by default on new installations.

## Build and test

Requires Node.js 20.19+ or 22.12+, Rust, the Visual Studio C++ build tools, and WebView2.

```powershell
npm ci
npm test
npm run test:ui
npm run build:windows
```

Browser tests use the installed Microsoft Edge and simulated audio/provider replies. They verify recording navigation and backup contents without using real API keys.

Finish any active recording before rebuilding. If Murmur runs from the build directory, `npm run build:windows -- -Restart` closes it cleanly, builds an NSIS installer, checks the executable version, copies the installer to the project root, and reopens Murmur. The script detects Scoop's Rust toolchain location. The local build configuration produces an installer without updater signatures; a published automatic update requires the release signing configuration.

After a successful native build, `npm run build:windows -- -PackageOnly` regenerates the installer without rebuilding its frontend or executable. Do not change source files or rebuild the frontend while a native build is embedding those assets.

Recent errors remain available in Settings → Data. Microphone availability and transcription accuracy still depend on the chosen device, audio quality, language, and speech model.
