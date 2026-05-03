fn main() {
    // Trans2Former local-only desktop shell.
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Trans2Former desktop shell");
}
