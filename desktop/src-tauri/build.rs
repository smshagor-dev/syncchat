fn main() {
    let windows = tauri_build::WindowsAttributes::new().static_vc_runtime(true);
    let attributes = tauri_build::Attributes::new().windows_attributes(windows);

    tauri_build::try_build(attributes).expect("failed to build SyncChat desktop resources");
}
