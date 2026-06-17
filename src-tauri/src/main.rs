fn main() {
    // Trans2Former local-only desktop shell.
    // 修复 issue #30: 移除未使用的 fs/dialog 插件（前端走浏览器 File API）
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Trans2Former desktop shell");
}
