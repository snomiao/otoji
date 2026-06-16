//! otoji desktop app.
//!
//! Launches the bundled `otoji server` WebSocket backend as a Tauri sidecar so
//! the whole app runs locally and offline. The React UI (served from the
//! bundled `dist/`) connects to `ws://127.0.0.1:8080/` via the
//! `otoji_local` STT provider.

use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the running sidecar child so we can terminate it on app exit.
#[derive(Default)]
struct SidecarState(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState::default())
        .setup(|app| {
            spawn_sidecar(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building otoji tauri application")
        .run(|app_handle, event| {
            // Kill the local server when the app is asked to quit so we don't
            // leave an orphaned `otoji server` listening on :8080.
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}

/// Spawn `otoji server` as a sidecar and stream its logs to stderr/stdout.
fn spawn_sidecar(app: &tauri::AppHandle) {
    let sidecar = match app.shell().sidecar("otoji") {
        Ok(cmd) => cmd.args(["server"]),
        Err(e) => {
            eprintln!("[otoji-app] failed to resolve otoji sidecar: {e}");
            return;
        }
    };
    let (mut rx, child) = match sidecar.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("[otoji-app] failed to spawn otoji server: {e}");
            return;
        }
    };
    if let Some(state) = app.try_state::<SidecarState>() {
        *state.0.lock().unwrap() = Some(child);
    }
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = rx.recv().await {
            match ev {
                CommandEvent::Stderr(line) => {
                    eprint!("[otoji-server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stdout(line) => {
                    print!("[otoji-server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => {
                    eprintln!("[otoji-server] error: {err}");
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[otoji-server] terminated: {payload:?}");
                }
                _ => {}
            }
        }
    });
}
