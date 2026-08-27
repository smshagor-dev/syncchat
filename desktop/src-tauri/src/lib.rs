use serde::Serialize;
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeInfo {
    app_name: String,
    version: String,
    platform: String,
    architecture: String,
    native_shell: bool,
}

#[tauri::command]
fn desktop_runtime_info(app: AppHandle) -> DesktopRuntimeInfo {
    DesktopRuntimeInfo {
        app_name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        native_shell: true,
    }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Register single-instance first so protocol/deep-link launches are
    // forwarded into the already-running desktop process.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            |app, _argv, _cwd| show_main(app),
        ));
    }

    builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    }

    builder
        .setup(|app| {
            #[cfg(desktop)]
            {
                let open_item = MenuItem::with_id(
                    app,
                    "open",
                    "Open SyncChat",
                    true,
                    None::<&str>,
                )?;
                let quit_item = MenuItem::with_id(
                    app,
                    "quit",
                    "Quit SyncChat",
                    true,
                    None::<&str>,
                )?;
                let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                let mut tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .show_menu_on_left_click(false);
                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }

                tray.on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            }

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |_event| {
                show_main(&handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![desktop_runtime_info])
        .run(tauri::generate_context!())
        .expect("error while running SyncChat desktop");
}
