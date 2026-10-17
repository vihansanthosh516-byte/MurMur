#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::{collections::HashMap, sync::Mutex, thread::sleep, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

fn cancel_key() -> Shortcut { Shortcut::new(None, Code::Escape) }

/// Registered hotkeys: shortcut id -> action name ("talk", "handsfree", "command", "cancel").
#[derive(Default)]
struct Hotkeys(Mutex<HashMap<u32, (String, Shortcut)>>);

/// Replace the user's hotkeys. Takes action -> shortcut text (e.g. "Ctrl+Space").
/// Returns the shortcuts that could not be registered (taken by another app or invalid).
#[tauri::command]
fn set_hotkeys(app: tauri::AppHandle, keys: tauri::State<Hotkeys>, map: HashMap<String, String>) -> Vec<String> {
    let gs = app.global_shortcut();
    let mut reg = keys.0.lock().unwrap();
    for (_, (name, sc)) in reg.drain() {
        if name != "cancel" {
            let _ = gs.unregister(sc);
        }
    }
    let mut failed = Vec::new();
    for (action, text) in map {
        match text.parse::<Shortcut>() {
            Ok(sc) if gs.register(sc).is_ok() => {
                reg.insert(sc.id(), (action, sc));
            }
            _ => failed.push(text),
        }
    }
    reg.insert(cancel_key().id(), ("cancel".into(), cancel_key()));
    failed
}

/// Mute the speakers while recording (so music doesn't get picked up), then restore.
#[derive(Default)]
struct MuteState(Mutex<Option<bool>>);

fn speakers() -> windows::core::Result<windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume> {
    use windows::Win32::{Media::Audio::*, System::Com::*};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        en.GetDefaultAudioEndpoint(eRender, eConsole)?.Activate(CLSCTX_ALL, None)
    }
}

#[tauri::command]
fn set_mute(state: tauri::State<MuteState>, on: bool) -> Result<(), String> {
    let vol = speakers().map_err(|e| e.to_string())?;
    let mut prev = state.0.lock().unwrap();
    unsafe {
        if on {
            if prev.is_none() {
                *prev = Some(vol.GetMute().map_err(|e| e.to_string())?.as_bool());
            }
            vol.SetMute(true, std::ptr::null()).map_err(|e| e.to_string())?;
        } else if let Some(was) = prev.take() {
            vol.SetMute(was, std::ptr::null()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Voice commands: press a key in the focused app.
#[tauri::command]
fn press_key(name: String) -> Result<(), String> {
    let mut en = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    for k in [Key::Control, Key::Shift, Key::Alt, Key::Space] {
        let _ = en.key(k, Direction::Release);
    }
    sleep(Duration::from_millis(60));
    match name.as_str() {
        "enter" => en.key(Key::Return, Direction::Click),
        "tab" => en.key(Key::Tab, Direction::Click),
        "undo" => return ctrl_combo('z'),
        _ => return Err("unknown key".into()),
    }
    .map_err(|e| e.to_string())
}

fn ctrl_combo(c: char) -> Result<(), String> {
    let mut en = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    // Let go of keys the user may still hold, so the combo is clean.
    for k in [Key::Shift, Key::Alt, Key::Space] {
        let _ = en.key(k, Direction::Release);
    }
    en.key(Key::Control, Direction::Press).map_err(|e| e.to_string())?;
    en.key(Key::Unicode(c), Direction::Click).map_err(|e| e.to_string())?;
    en.key(Key::Control, Direction::Release).map_err(|e| e.to_string())?;
    Ok(())
}

/// Put text in the clipboard, press Ctrl+V in the focused app, then restore the old clipboard.
#[tauri::command]
fn paste_text(text: String, keep_in_clipboard: bool, type_it: bool) -> Result<(), String> {
    if type_it {
        // Terminals: type key by key. Newlines become spaces so nothing runs by accident.
        let mut en = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        for k in [Key::Control, Key::Shift, Key::Alt, Key::Space] {
            let _ = en.key(k, Direction::Release);
        }
        sleep(Duration::from_millis(40));
        return en.text(&text.lines().collect::<Vec<_>>().join(" ")).map_err(|e| e.to_string());
    }
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let old = cb.get_text().ok();
    cb.set_text(text).map_err(|e| e.to_string())?;
    sleep(Duration::from_millis(60));
    ctrl_combo('v')?;
    sleep(Duration::from_millis(250));
    if !keep_in_clipboard {
        if let Some(o) = old {
            let _ = cb.set_text(o);
        }
    }
    Ok(())
}

/// Press Ctrl+C in the focused app and return what got copied (for command mode).
#[tauri::command]
fn copy_selection() -> Result<String, String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let old = cb.get_text().unwrap_or_default();
    let _ = cb.set_text(String::new());
    ctrl_combo('c')?;
    sleep(Duration::from_millis(200));
    let got = cb.get_text().unwrap_or_default();
    let _ = cb.set_text(old);
    Ok(got)
}

/// Title of the window the user is typing in (used to pick a writing style).
#[tauri::command]
fn active_window_title() -> String {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
    unsafe {
        let h = GetForegroundWindow();
        let mut buf = [0u16; 512];
        let n = GetWindowTextW(h, buf.as_mut_ptr(), buf.len() as i32);
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }
}

#[tauri::command]
fn set_overlay(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let w = app.get_webview_window("overlay").ok_or("no overlay")?;
    if visible {
        if let Ok(Some(m)) = w.primary_monitor() {
            let s = m.size();
            let ws = w.outer_size().map_err(|e| e.to_string())?;
            let x = m.position().x + (s.width as i32 - ws.width as i32) / 2;
            let y = m.position().y + s.height as i32 - ws.height as i32 - (80.0 * m.scale_factor()) as i32;
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
        w.show().map_err(|e| e.to_string())?;
    } else {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open the main window on a page (used by the floating bar buttons).
#[tauri::command]
fn open_main(app: tauri::AppHandle, page: String) {
    show_main(&app);
    let _ = app.emit("nav", page);
}

/// Clicks on the floating bar must not steal focus from the app the user types in.
fn make_no_activate(w: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW};
    if let Ok(h) = w.hwnd() {
        unsafe {
            let hwnd = h.0 as _;
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) as isize);
        }
    }
}

#[tauri::command]
fn set_cancel_key(app: tauri::AppHandle, on: bool) {
    let gs = app.global_shortcut();
    if on {
        let _ = gs.register(cancel_key());
    } else {
        let _ = gs.unregister(cancel_key());
    }
}

// ---------- saved settings ----------
// Settings live in files in the app data folder. Browser storage alone can lose
// recent writes when the app is closed, which wiped the API key.
fn kv_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("store");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

#[tauri::command]
fn save_kv(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("bad key".into());
    }
    let d = kv_dir(&app)?;
    let tmp = d.join(format!("{key}.tmp"));
    std::fs::write(&tmp, value).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, d.join(format!("{key}.json"))).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_kv(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    let mut out = HashMap::new();
    for e in std::fs::read_dir(kv_dir(&app)?).map_err(|e| e.to_string())?.flatten() {
        let path = e.path();
        if path.extension().and_then(|x| x.to_str()) == Some("json") {
            if let (Some(k), Ok(v)) = (path.file_stem().and_then(|x| x.to_str()), std::fs::read_to_string(&path)) {
                out.insert(k.to_string(), v);
            }
        }
    }
    Ok(out)
}

/// Quit cleanly: give the speakers back their old mute state first.
fn quit(app: &tauri::AppHandle) {
    if let Some(was) = app.state::<MuteState>().0.lock().unwrap().take() {
        if let Ok(v) = speakers() {
            unsafe {
                let _ = v.SetMute(was, std::ptr::null());
            }
        }
    }
    app.exit(0);
}

/// Add "Quit Murmur" to the Start menu (runs murmur.exe --quit).
fn add_quit_shortcut() {
    let Ok(appdata) = std::env::var("APPDATA") else { return };
    let lnk = format!("{appdata}\\Microsoft\\Windows\\Start Menu\\Programs\\Quit Murmur.lnk");
    let Ok(exe) = std::env::current_exe() else { return };
    if std::path::Path::new(&lnk).exists() {
        return;
    }
    let script = format!(
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{}');$s.TargetPath='{}';$s.Arguments='--quit';$s.IconLocation='{},0';$s.Save()",
        lnk.replace('\'', "''"),
        exe.display().to_string().replace('\'', "''"),
        exe.display().to_string().replace('\'', "''")
    );
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .creation_flags(0x0800_0000) // no console window
        .spawn();
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // A second launch talks to the running app: "--quit" stops it, otherwise open the window.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == "--quit") {
                quit(app);
            } else {
                show_main(app);
            }
        }))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, sc, ev| {
                    let keys = app.state::<Hotkeys>();
                    let Some(id) = keys.0.lock().unwrap().get(&sc.id()).map(|(n, _)| n.clone()) else { return };
                    let state = if ev.state() == ShortcutState::Pressed { "down" } else { "up" };
                    let _ = app.emit("hotkey", serde_json::json!({ "id": id, "state": state }));
                })
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Hotkeys::default())
        .manage(MuteState::default())
        .invoke_handler(tauri::generate_handler![
            paste_text, copy_selection, active_window_title, set_overlay, open_main,
            set_hotkeys, set_mute, press_key, set_cancel_key, save_kv, load_kv
        ])
        .setup(|app| {

            let show = MenuItem::with_id(app, "show", "Open Murmur", true, None::<&str>)?;
            if std::env::args().any(|a| a == "--quit") {
                // Nothing was running, so there is nothing to quit.
                std::process::exit(0);
            }
            add_quit_shortcut();
            let stop = MenuItem::with_id(app, "stop", "Stop recording", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Murmur", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &stop, &quit_item])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Murmur")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show_main(app),
                    "stop" => {
                        let _ = app.emit("hotkey", serde_json::json!({ "id": "cancel", "state": "down" }));
                    }
                    "quit" => quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = e {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            if let Some(ov) = app.get_webview_window("overlay") {
                make_no_activate(&ov);
                let _ = ov.set_ignore_cursor_events(true);
            }

            if std::env::args().any(|a| a == "--hidden") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|win, ev| {
            // Closing the main window hides it to the tray so hotkeys keep working.
            if let WindowEvent::CloseRequested { api, .. } = ev {
                if win.label() == "main" {
                    api.prevent_close();
                    let _ = win.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Murmur");
}
