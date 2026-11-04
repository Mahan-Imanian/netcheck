fn main() {
    let windows = tauri_build::WindowsAttributes::new().app_manifest(include_str!("app.manifest"));
    if let Err(e) = tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows)) {
        panic!("tauri build script failed: {e:#}");
    }
}
