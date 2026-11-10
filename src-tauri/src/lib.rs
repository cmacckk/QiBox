mod icon;

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};

/// 主窗口标签，与 tauri.conf.json 保持一致。
const MAIN_LABEL: &str = "main";
const PANEL_LABEL: &str = "panels";
const MAX_BACKUPS: usize = 10;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例必须最先注册：第二个实例会唤起已有窗口后退出。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingPanel::default())
        .setup(|app| {
            build_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_paths,
            read_config,
            write_config,
            list_backups,
            read_backup,
            export_config,
            import_config,
            launch,
            wsl_distros,
            target_exists,
            set_main_position,
            read_image_data,
            read_exe_icon,
            list_themes,
            read_theme,
            write_theme,
            list_plugins,
            read_plugin_script,
            install_plugin,
            remove_plugin,
            open_plugins_dir,
            list_processes,
            kill_process,
            read_logs,
            list_fonts,
            open_data_dir,
            quit_app,
            open_panel_window,
            close_panel_window,
            take_pending_panel
        ])
        .run(tauri::generate_context!())
        .expect("error while running QiBox");
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        let visible = window.is_visible().unwrap_or(false);
        let minimized = window.is_minimized().unwrap_or(false);
        if visible && !minimized {
            let _ = window.hide();
        } else {
            show_main(app);
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 QiBox", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &hide, &quit])?;

    let mut builder = TrayIconBuilder::with_id("qibox-tray")
        .tooltip("QiBox 工具箱")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "hide" => {
                if let Some(window) = app.get_webview_window(MAIN_LABEL) {
                    let _ = window.hide();
                }
            }
            "settings" => {
                show_main(app);
                let _ = app.emit("qibox://open-settings", ());
            }
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
                toggle_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

// ---------- 路径与配置 ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    data_dir: String,
    config_file: String,
    backups_dir: String,
    exe_dir: String,
    exe_path: String,
}

fn qi_box_dir() -> PathBuf {
    match std::env::var_os("APPDATA") {
        Some(base) => PathBuf::from(base).join("QiBox"),
        None => PathBuf::from(".").join("QiBox"),
    }
}

fn plugins_dir() -> PathBuf {
    qi_box_dir().join("plugins")
}

fn sanitize_plugin_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err("插件名称不合法".into());
    }
    Ok(trimmed.to_string())
}

#[derive(serde::Serialize)]
struct PluginInfo {
    name: String,
    version: String,
    description: String,
    keywords: String,
    entry: String,
}

fn plugin_info(dir: &Path) -> Option<PluginInfo> {
    let manifest = fs::read_to_string(dir.join("plugin.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&manifest).ok()?;
    let folder = dir.file_name()?.to_string_lossy().to_string();
    let text = |key: &str| {
        json.get(key)
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    Some(PluginInfo {
        name: if text("name").is_empty() {
            folder
        } else {
            text("name")
        },
        version: text("version"),
        description: text("description"),
        keywords: text("keywords"),
        entry: if text("entry").is_empty() {
            "main.js".into()
        } else {
            text("entry")
        },
    })
}

#[tauri::command]
fn list_plugins() -> Vec<PluginInfo> {
    let mut plugins: Vec<PluginInfo> = fs::read_dir(plugins_dir())
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| entry.path().is_dir())
                .filter_map(|entry| plugin_info(&entry.path()))
                .collect()
        })
        .unwrap_or_default();
    plugins.sort_by_key(|a| a.name.to_lowercase());
    plugins
}

#[tauri::command]
fn read_plugin_script(name: String) -> Result<String, String> {
    let folder = sanitize_plugin_name(&name)?;
    let dir = plugins_dir().join(&folder);
    let info = plugin_info(&dir).ok_or_else(|| format!("找不到插件：{folder}"))?;
    fs::read_to_string(dir.join(info.entry)).map_err(|error| format!("读取插件脚本失败：{error}"))
}

fn copy_dir(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let destination = target.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &destination)?;
        } else {
            fs::copy(&path, &destination)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn install_plugin(source: String) -> Result<String, String> {
    let from = PathBuf::from(source.trim());
    if !from.is_dir() {
        return Err("请选择一个插件文件夹".into());
    }
    if plugin_info(&from).is_none() {
        return Err("文件夹里没有 plugin.json".into());
    }
    let folder = from
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| "插件文件夹名称无效".to_string())?;
    let folder = sanitize_plugin_name(&folder)?;
    let target = plugins_dir().join(&folder);
    if target.exists() {
        return Err(format!("插件「{folder}」已存在，先卸载再安装"));
    }
    copy_dir(&from, &target).map_err(|error| format!("复制插件失败：{error}"))?;
    Ok(folder)
}

#[tauri::command]
fn remove_plugin(name: String) -> Result<(), String> {
    let folder = sanitize_plugin_name(&name)?;
    let dir = plugins_dir().join(&folder);
    if !dir.is_dir() {
        return Err(format!("找不到插件：{folder}"));
    }
    fs::remove_dir_all(&dir).map_err(|error| format!("卸载失败：{error}"))
}

#[tauri::command]
fn open_plugins_dir() -> Result<(), String> {
    let dir = plugins_dir();
    fs::create_dir_all(&dir).map_err(|error| format!("创建插件目录失败：{error}"))?;
    Command::new("explorer")
        .arg(dir.as_os_str())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("打开插件目录失败：{error}"))
}

fn themes_dir() -> PathBuf {
    qi_box_dir().join("themes")
}

fn sanitize_theme_file(file: &str) -> Result<String, String> {
    let mut name = file.trim().to_string();
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("主题文件名不合法".into());
    }
    if !name.ends_with(".json") {
        name.push_str(".json");
    }
    Ok(name)
}

#[tauri::command]
fn list_themes() -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(themes_dir())
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
                .filter(|name| name.ends_with(".json"))
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

#[tauri::command]
fn read_theme(file: String) -> Result<String, String> {
    let name = sanitize_theme_file(&file)?;
    std::fs::read_to_string(themes_dir().join(name))
        .map_err(|error| format!("读取主题失败：{error}"))
}

#[tauri::command]
fn write_theme(file: String, content: String) -> Result<String, String> {
    let name = sanitize_theme_file(&file)?;
    let dir = themes_dir();
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建主题目录失败：{error}"))?;
    let path = dir.join(&name);
    write_atomic(&path, &content)?;
    Ok(path.to_string_lossy().to_string())
}

fn exe_path() -> PathBuf {
    std::env::current_exe().unwrap_or_default()
}

fn exe_dir() -> PathBuf {
    exe_path()
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default()
}

#[tauri::command]
fn app_paths() -> AppPaths {
    let data_dir = qi_box_dir();
    AppPaths {
        config_file: data_dir.join("config.json").to_string_lossy().to_string(),
        backups_dir: data_dir.join("backups").to_string_lossy().to_string(),
        exe_dir: exe_dir().to_string_lossy().to_string(),
        exe_path: exe_path().to_string_lossy().to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
    }
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建目录失败：{error}"))?;
    }
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, contents).map_err(|error| format!("写入临时文件失败：{error}"))?;
    fs::rename(&temp, path).map_err(|error| format!("替换配置文件失败：{error}"))
}

/// 每天最多保留一份备份，总份数超出上限时删最旧的。
fn rotate_backups(backups: &Path) -> Result<(), String> {
    fs::create_dir_all(backups).map_err(|error| format!("创建备份目录失败：{error}"))?;
    let mut names: Vec<String> = fs::read_dir(backups)
        .map_err(|error| format!("读取备份目录失败：{error}"))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| name.starts_with("config-") && name.ends_with(".json"))
        .collect();
    names.sort();
    while names.len() >= MAX_BACKUPS {
        if let Some(oldest) = names.first() {
            let _ = fs::remove_file(backups.join(oldest));
            names.remove(0);
        } else {
            break;
        }
    }
    Ok(())
}

#[tauri::command]
fn read_config() -> Result<Option<String>, String> {
    let path = qi_box_dir().join("config.json");
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|error| format!("读取配置失败：{error}"))
}

#[tauri::command]
fn write_config(config: String) -> Result<(), String> {
    let dir = qi_box_dir();
    let path = dir.join("config.json");
    let backups = dir.join("backups");
    rotate_backups(&backups)?;

    if let Ok(previous) = fs::read_to_string(&path) {
        if previous != config {
            let day = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|time| time.as_secs() / 86_400)
                .unwrap_or(0);
            let backup = backups.join(format!("config-{day}.json"));
            if !backup.exists() {
                let _ = fs::write(&backup, previous);
            }
        }
    }

    write_atomic(&path, &config)
}

#[tauri::command]
fn list_backups() -> Result<Vec<String>, String> {
    let backups = qi_box_dir().join("backups");
    if !backups.exists() {
        return Ok(Vec::new());
    }
    let mut names: Vec<String> = fs::read_dir(&backups)
        .map_err(|error| format!("读取备份目录失败：{error}"))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| name.ends_with(".json"))
        .collect();
    names.sort();
    names.reverse();
    Ok(names)
}

#[tauri::command]
fn read_backup(name: String) -> Result<String, String> {
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("非法的备份文件名".into());
    }
    let path = qi_box_dir().join("backups").join(name);
    fs::read_to_string(&path).map_err(|error| format!("读取备份失败：{error}"))
}

#[tauri::command]
fn export_config(path: String, config: String) -> Result<(), String> {
    write_atomic(Path::new(&path), &config)
}

#[tauri::command]
fn import_config(path: String) -> Result<String, String> {
    fs::read_to_string(Path::new(&path)).map_err(|error| format!("读取导入文件失败：{error}"))
}

#[tauri::command]
fn open_data_dir() -> Result<(), String> {
    let dir = qi_box_dir();
    fs::create_dir_all(&dir).map_err(|error| format!("创建数据目录失败：{error}"))?;
    Command::new("explorer")
        .arg(dir)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("打开数据目录失败：{error}"))
}

// ---------- 背景图片 ----------

/// 背景图体积上限，超过就拒绝：整张图要经 IPC 转成 base64，太大前端会卡。
const MAX_IMAGE_BYTES: u64 = 12 * 1024 * 1024;
/// 读 exe 图标的文件大小上限，避免误选几百 MB 的文件卡住主线程。
const MAX_ICON_FILE_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageData {
    mime: String,
    data: String,
}

fn image_mime(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        _ => None,
    }
}

/// 从 exe/dll 里抽主图标（只读解析，不执行目标程序）。
#[tauri::command]
async fn read_exe_icon(path: String) -> Result<ImageData, String> {
    let file = PathBuf::from(path.trim());
    let meta = fs::metadata(&file).map_err(|_| format!("找不到程序：{}", file.display()))?;
    if !meta.is_file() {
        return Err("选择的不是程序文件".to_string());
    }
    if meta.len() > MAX_ICON_FILE_BYTES {
        return Err("程序超过 256 MB，读取图标可能太慢，请直接选 .ico 文件".to_string());
    }
    let bytes = fs::read(&file).map_err(|error| format!("读取程序失败：{error}"))?;
    let icon = icon::extract_icon(&bytes)
        .ok_or_else(|| format!("这个文件里没有图标资源：{}", file.display()))?;
    Ok(ImageData {
        mime: "image/x-icon".to_string(),
        data: base64_encode(&icon),
    })
}

/// 读本地图片并转成 data URL；不开 asset 协议，也不用把图片复制进数据目录。
#[tauri::command]
async fn read_image_data(path: String) -> Result<ImageData, String> {
    let file = PathBuf::from(path.trim());
    let mime = image_mime(&file)
        .ok_or_else(|| "只支持 png / jpg / webp / gif / bmp / avif 图片".to_string())?;
    let meta = fs::metadata(&file).map_err(|_| format!("找不到图片：{}", file.display()))?;
    if !meta.is_file() {
        return Err("选择的不是图片文件".to_string());
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("图片超过 12 MB，请换一张小一点的".to_string());
    }
    let bytes = fs::read(&file).map_err(|error| format!("读取图片失败：{error}"))?;
    Ok(ImageData {
        mime: mime.to_string(),
        data: base64_encode(&bytes),
    })
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// ---------- 主窗口位置 ----------

/// 把主窗口放回上次记住的位置（物理像素）。
/// 位置不在任何显示器上（拔掉副屏、改了分辨率）就居中，避免窗口跑到屏幕外找不回来。
#[tauri::command]
fn set_main_position(window: WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    if window.label() != MAIN_LABEL {
        return Err("只允许主窗口设置位置".into());
    }
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let on_screen = monitors.iter().any(|monitor| {
        let origin = monitor.position();
        let size = monitor.size();
        let right = origin.x + size.width as i32;
        let bottom = origin.y + size.height as i32;
        // 要求标题栏那一条在屏幕内，否则用户拖不回来。
        x + 60 > origin.x && x + 60 < right && y + 20 > origin.y && y + 20 < bottom
    });
    if on_screen {
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())
    } else {
        window.center().map_err(|error| error.to_string())
    }
}

// ---------- 启动项目 ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetInfo {
    exists: bool,
    is_dir: bool,
}

#[tauri::command]
fn target_exists(path: String) -> TargetInfo {
    let path = Path::new(path.trim());
    TargetInfo {
        exists: path.exists(),
        is_dir: path.is_dir(),
    }
}

fn quote_arg(value: &str) -> String {
    let trimmed = value.trim().trim_matches('"');
    format!("\"{trimmed}\"")
}

/// 解析启动参数：支持双引号包裹与空格分隔，供直接启动 exe 使用。
fn split_args(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for ch in input.chars() {
        match ch {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

fn powershell_elevated(program: &str, args: &[String], work_dir: &str) -> Result<(), String> {
    let mut script = format!("Start-Process -FilePath '{}'", program.replace('\'', "''"));
    if !work_dir.is_empty() {
        script.push_str(&format!(
            " -WorkingDirectory '{}'",
            work_dir.replace('\'', "''")
        ));
    }
    if !args.is_empty() {
        let list: Vec<String> = args
            .iter()
            .map(|arg| format!("'{}'", arg.replace('\'', "''")))
            .collect();
        script.push_str(&format!(" -ArgumentList {}", list.join(",")));
    }
    script.push_str(" -Verb RunAs");

    // PowerShell 用 UTF-16LE + Base64，避免中文路径与引号在命令行里被剥掉。
    let mut bytes = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    let base64 = base64_encode(&bytes);

    let mut command = Command::new("powershell");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-EncodedCommand",
        ])
        .arg(base64);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("提权启动失败：{error}"))
}

fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn is_direct_executable(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .as_deref(),
        Some("exe") | Some("com")
    )
}

/// 展开 %NAME% 形式的 Windows 环境变量；未知变量保持原样，交给系统去报错。
fn expand_env(input: &str) -> String {
    if !input.contains('%') {
        return input.to_string();
    }
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let tail = &rest[start + 1..];
        match tail.find('%') {
            Some(end) if end > 0 => {
                let name = &tail[..end];
                match std::env::var(name) {
                    Ok(value) => out.push_str(&value),
                    Err(_) => {
                        out.push('%');
                        out.push_str(name);
                        out.push('%');
                    }
                }
                rest = &tail[end + 1..];
            }
            _ => {
                out.push('%');
                rest = tail;
            }
        }
    }
    out.push_str(rest);
    out
}

/// 按扩展名挑解释器；runner 非空时优先用用户指定的解释器。
fn script_plan(path: &Path, runner: &str) -> Option<(String, Vec<String>)> {
    let display = path.to_string_lossy().to_string();
    let runner = runner.trim();
    if !runner.is_empty() {
        return Some((runner.to_string(), vec![display]));
    }
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "ps1" => Some((
            "powershell".into(),
            vec![
                "-NoProfile".into(),
                "-ExecutionPolicy".into(),
                "Bypass".into(),
                "-File".into(),
                display,
            ],
        )),
        "bat" | "cmd" => Some(("cmd".into(), vec!["/C".into(), display])),
        "py" => Some(("python".into(), vec![display])),
        "js" | "mjs" => Some(("node".into(), vec![display])),
        _ => None,
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WslOptions {
    pub distro: String,
    pub cwd: String,
}

/// `wsl --list --quiet` 的输出是 UTF-16LE，也可能带 BOM 或空行。
fn decode_wsl_list(bytes: &[u8]) -> String {
    let padded = if bytes.len() % 2 == 1 {
        &bytes[..bytes.len() - 1]
    } else {
        bytes
    };
    let looks_utf16 = padded
        .chunks_exact(2)
        .take(32)
        .any(|pair| pair[1] == 0 && pair[0] != 0);
    if !looks_utf16 {
        return String::from_utf8_lossy(padded).trim().to_string();
    }
    let mut words = Vec::with_capacity(padded.len() / 2);
    for pair in padded.chunks_exact(2) {
        words.push(u16::from_le_bytes([pair[0], pair[1]]));
    }
    String::from_utf16_lossy(&words)
        .trim()
        .trim_start_matches('\u{feff}')
        .to_string()
}

/// 读取本机 WSL 发行版名称，供编辑器下拉使用。
#[tauri::command]
fn wsl_distros() -> Result<Vec<String>, String> {
    let mut command = Command::new("wsl");
    command.arg("--list").arg("--quiet");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("读取 WSL 发行版失败：{error}"))?;
    if !output.status.success() {
        return Err("读取 WSL 发行版失败：wsl 返回了错误状态".into());
    }
    let text = decode_wsl_list(&output.stdout);
    Ok(text
        .split(['\r', '\n'])
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect())
}

/// `wsl [-d 发行版] [--cd 目录] -- <命令> <参数...>`，逐段传参，不经过 Windows shell。
fn wsl_args(options: &WslOptions, program: &str, args: &[String]) -> Result<Vec<String>, String> {
    let program = program.trim();
    if program.is_empty() {
        return Err("WSL 命令为空".into());
    }
    let mut out = Vec::new();
    let distro = options.distro.trim();
    if !distro.is_empty() {
        out.push("-d".into());
        out.push(distro.to_string());
    }
    let cwd = options.cwd.trim();
    if !cwd.is_empty() {
        out.push("--cd".into());
        out.push(cwd.to_string());
    }
    out.push("--".into());
    out.push(program.to_string());
    out.extend(args.iter().cloned());
    Ok(out)
}

/// 启动一个项目：可执行文件直接起进程；脚本交给解释器；其余交给系统 shell。
fn launch_inner(
    target: String,
    args: String,
    work_dir: String,
    admin: bool,
    runner: Option<String>,
    wsl: Option<WslOptions>,
) -> Result<(), String> {
    let target = expand_env(target.trim().trim_matches('"'));
    let args = expand_env(&args);
    let work_dir = expand_env(&work_dir);
    let runner = expand_env(&runner.unwrap_or_default());
    if target.is_empty() {
        return Err("启动目标为空".into());
    }

    let path = Path::new(&target);
    let is_url = target.starts_with("http://") || target.starts_with("https://");
    let cwd = if work_dir.is_empty() {
        None
    } else {
        Some(PathBuf::from(work_dir.trim()))
    };
    if let Some(options) = wsl {
        // WSL 里跑命令：目标就是 Linux 命令或脚本路径，参数照旧逐段传。
        let program = if !runner.trim().is_empty() {
            runner.clone()
        } else if target.to_ascii_lowercase().ends_with(".sh") {
            "bash".to_string()
        } else {
            target.clone()
        };
        let mut program_args: Vec<String> = Vec::new();
        if program != target {
            program_args.push(target.clone());
        }
        program_args.extend(split_args(&args));
        let mut command = Command::new("wsl");
        command.args(wsl_args(&options, &program, &program_args)?);
        // WSL 内的提权交给发行版自己的 sudo，这里不额外加 UAC。
        return command
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("WSL 启动失败：{error}"));
    }

    let plan = if is_url {
        None
    } else {
        script_plan(path, &runner)
    };

    if let Some((program, prefix)) = plan {
        if !path.exists() {
            return Err(format!("找不到脚本：{target}"));
        }
        let mut all = prefix;
        all.extend(split_args(&args));
        if admin {
            return powershell_elevated(&program, &all, &work_dir);
        }
        let mut command = Command::new(&program);
        command.args(&all);
        if let Some(dir) = cwd.as_ref().filter(|dir| dir.is_dir()) {
            command.current_dir(dir);
        }
        return command
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("启动失败：{error}"));
    }

    if admin {
        return powershell_elevated(&target, &split_args(&args), &work_dir);
    }

    if !is_url && is_direct_executable(path) {
        if !path.exists() {
            return Err(format!("找不到程序：{target}"));
        }
        let mut command = Command::new(path);
        command.args(split_args(&args));
        if let Some(dir) = cwd.as_ref().filter(|dir| dir.is_dir()) {
            command.current_dir(dir);
        }
        return command
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("启动失败：{error}"));
    }

    if !is_url && !path.exists() {
        return Err(format!("找不到目标：{target}"));
    }

    let mut line = String::from("/C start \"\" ");
    line.push_str(&quote_arg(&target));
    if !args.is_empty() {
        line.push(' ');
        line.push_str(&args);
    }
    let mut command = Command::new("cmd");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
        command.raw_arg(line);
    }
    #[cfg(not(windows))]
    {
        command.arg("/C").arg("start").arg("").arg(&target);
    }
    if let Some(dir) = cwd.as_ref().filter(|dir| dir.is_dir()) {
        command.current_dir(dir);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("启动失败：{error}"))
}

// ---------- 面板窗口 ----------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PanelRequest {
    pub panel: String,
    pub arg: String,
    pub width: f64,
    pub height: f64,
    pub title: String,
}

fn panel_url(_request: &PanelRequest) -> String {
    // 面板窗口统一加载 panel.html，具体面板通过 qibox://open-panel 事件下发。
    // 带 query 的 WebviewUrl::App 在 dev 下会被解析成 about:blank，故不用 query。
    "panel.html".to_string()
}

#[derive(Default)]
struct PendingPanel(std::sync::Mutex<Option<PanelRequest>>);

fn remember_panel(app: &AppHandle, request: &PanelRequest) {
    if let Ok(mut slot) = app.state::<PendingPanel>().0.lock() {
        *slot = Some(request.clone());
    }
}

/// 面板窗口启动后主动取一次请求，避免 emit 早于前端挂监听而丢事件。
#[tauri::command]
fn take_pending_panel(state: tauri::State<'_, PendingPanel>) -> Option<PanelRequest> {
    state.0.lock().ok().and_then(|mut slot| slot.take())
}

#[tauri::command]
async fn open_panel_window(
    app: AppHandle,
    state: tauri::State<'_, PendingPanel>,
    request: PanelRequest,
) -> Result<(), String> {
    let size = tauri::LogicalSize::new(request.width, request.height);

    if let Some(window) = app.get_webview_window(PANEL_LABEL) {
        if let Ok(mut slot) = state.0.lock() {
            *slot = Some(request.clone());
        }
        window
            .set_size(tauri::Size::Logical(size))
            .map_err(|error| error.to_string())?;
        window
            .set_title(&request.title)
            .map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        app.emit_to(PANEL_LABEL, "qibox://open-panel", &request)
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    remember_panel(&app, &request);

    let handle = app.clone();
    tauri::WebviewWindowBuilder::new(
        &app,
        PANEL_LABEL,
        tauri::WebviewUrl::App(panel_url(&request).into()),
    )
    .title(&request.title)
    .inner_size(request.width, request.height)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .skip_taskbar(true)
    .center()
    .visible(true)
    // 页面真正加载完再下发面板请求，否则 panel-main 还没挂上监听。
    .on_page_load(move |webview, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let latest = handle
                .state::<PendingPanel>()
                .0
                .lock()
                .ok()
                .and_then(|slot| slot.clone());
            if let Some(request) = latest {
                let _ = webview.emit("qibox://open-panel", request);
            }
        }
    })
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
async fn close_panel_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PANEL_LABEL) {
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn logs_dir() -> PathBuf {
    qi_box_dir().join("logs")
}

/// 每次启动都留一行：毫秒时间戳、结果、目标、错误详情（有的话）。
fn log_launch(target: &str, result: &Result<(), String>) {
    let dir = logs_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let (status, detail) = match result {
        Ok(()) => ("ok", String::new()),
        Err(error) => ("error", error.clone()),
    };
    let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("launch.log"))
    else {
        return;
    };
    let _ = writeln!(file, "{stamp}	{status}	{target}	{detail}");
}

#[tauri::command]
fn launch(
    target: String,
    args: String,
    work_dir: String,
    admin: bool,
    runner: Option<String>,
    wsl: Option<WslOptions>,
) -> Result<(), String> {
    let result = launch_inner(target.clone(), args, work_dir, admin, runner, wsl);
    log_launch(&target, &result);
    result
}

#[derive(serde::Serialize)]
struct ProcessInfo {
    pid: u32,
    name: String,
    memory_mb: f64,
}

/// 进程列表用 PowerShell 的 Get-Process 取，避免额外依赖；输出强制 UTF-8。
/// 已安装字体列表。只读系统字体，用于界面字体下拉。
static FONT_CACHE: std::sync::Mutex<Option<Vec<String>>> = std::sync::Mutex::new(None);

#[tauri::command]
async fn list_fonts() -> Result<Vec<String>, String> {
    if let Ok(guard) = FONT_CACHE.lock() {
        if let Some(cached) = guard.as_ref() {
            return Ok(cached.clone());
        }
    }
    let script = "$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type -AssemblyName System.Drawing;(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name } | Sort-Object -Unique";
    let mut command = Command::new("powershell");
    command.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("读取字体列表失败：{error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("读取字体列表失败：{detail}"));
    }
    let text = String::from_utf8_lossy(&output.stdout).trim_start_matches('\u{feff}').to_string();
    let mut fonts: Vec<String> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect();
    fonts.sort_by_key(|name| name.to_lowercase());
    fonts.dedup();
    if let Ok(mut guard) = FONT_CACHE.lock() {
        *guard = Some(fonts.clone());
    }
    Ok(fonts)
}

#[tauri::command]
fn list_processes() -> Result<Vec<ProcessInfo>, String> {
    let script = "$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8;Get-Process | Sort-Object WS -Descending | Select-Object -First 300 Id,ProcessName,@{n='mb';e={[math]::Round($_.WS/1MB,1)}} | ConvertTo-Json -Compress";
    let mut command = Command::new("powershell");
    command.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("无法读取进程列表：{error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(Vec::new());
    }
    let value: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|error| format!("进程列表解析失败：{error}"))?;
    let rows = match value {
        serde_json::Value::Array(rows) => rows,
        other => vec![other],
    };
    let mut processes = Vec::new();
    for row in rows {
        let pid = row.get("Id").and_then(|value| value.as_u64()).unwrap_or(0) as u32;
        if pid == 0 {
            continue;
        }
        processes.push(ProcessInfo {
            pid,
            name: row
                .get("ProcessName")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
            memory_mb: row
                .get("mb")
                .and_then(|value| value.as_f64())
                .unwrap_or(0.0),
        });
    }
    Ok(processes)
}

#[tauri::command]
fn kill_process(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Err("PID 无效".into());
    }
    // 用 PowerShell 而不是 taskkill：taskkill 的中文错误是本地代码页，读出来会乱码。
    let script = format!(
        "$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8;
try {{ Stop-Process -Id {pid} -Force; 'ok' }} catch {{ 'ERR ' + $_.Exception.Message }}"
    );
    let mut command = Command::new("powershell");
    command.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("无法结束进程：{error}"))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed == "ok" {
        return Ok(());
    }
    if let Some(detail) = trimmed.strip_prefix("ERR ") {
        return Err(format!("结束进程失败：{detail}"));
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "结束进程失败：{}",
        if trimmed.is_empty() {
            stderr.trim()
        } else {
            trimmed
        }
    ))
}

#[tauri::command]
fn read_logs(limit: usize) -> Vec<String> {
    let Ok(text) = fs::read_to_string(logs_dir().join("launch.log")) else {
        return Vec::new();
    };
    let take = limit.clamp(1, 500);
    let mut lines: Vec<String> = text
        .lines()
        .rev()
        .take(take)
        .map(|line| line.to_string())
        .collect();
    lines.reverse();
    lines
}

#[cfg(test)]
mod tests {
    use super::script_plan;
    use super::{base64_encode, image_mime};
    use std::path::Path;

    #[test]
    fn script_plan_picks_interpreter_by_extension() {
        let ps1 = script_plan(Path::new(r"C:\tools\run.ps1"), "").expect("ps1 应走解释器");
        assert_eq!(ps1.0, "powershell", "ps1 用 powershell");
        assert!(ps1.1.iter().any(|arg| arg == "-File"), "ps1 需要 -File");

        let bat = script_plan(Path::new(r"C:\tools\run.bat"), "").expect("bat 应走解释器");
        assert_eq!(bat.0, "cmd", "bat 用 cmd");
        assert_eq!(bat.1.first().map(String::as_str), Some("/C"), "bat 需要 /C");

        let py = script_plan(Path::new("x.py"), "").expect("py 应走解释器");
        assert_eq!(py.0, "python", "py 用 python");

        assert!(
            script_plan(Path::new("x.exe"), "").is_none(),
            "exe 不走解释器"
        );
    }

    #[test]
    fn script_plan_prefers_runner_override() {
        let plan = script_plan(Path::new("x.txt"), "wsl").expect("指定解释器后应走解释器");
        assert_eq!(plan.0, "wsl", "用户指定的解释器优先");
        assert_eq!(plan.1.len(), 1, "解释器只接收脚本路径");
    }

    #[test]
    fn wsl_args_builds_distro_and_cwd() {
        let options = super::WslOptions {
            distro: "kali-linux".into(),
            cwd: "/root/tools".into(),
        };
        let args = super::wsl_args(&options, "nmap", &["-sV".to_string()]).expect("应生成参数");
        assert_eq!(
            args,
            vec![
                "-d",
                "kali-linux",
                "--cd",
                "/root/tools",
                "--",
                "nmap",
                "-sV"
            ],
            "显式发行版与工作目录时参数顺序必须正确"
        );
    }

    #[test]
    fn wsl_args_skips_empty_options() {
        let options = super::WslOptions {
            distro: "  ".into(),
            cwd: "".into(),
        };
        let args = super::wsl_args(&options, "ls", &["-la".to_string()]).expect("应生成参数");
        assert_eq!(
            args,
            vec!["--", "ls", "-la"],
            "空发行版/目录不应出现占位参数"
        );
    }

    #[test]
    fn wsl_args_rejects_empty_program() {
        let options = super::WslOptions {
            distro: String::new(),
            cwd: String::new(),
        };
        assert!(
            super::wsl_args(&options, "   ", &[]).is_err(),
            "空命令必须报错"
        );
    }

    #[test]
    fn decode_wsl_list_handles_utf16_and_utf8() {
        let mut utf16 = Vec::new();
        for unit in "kali-linux\r\nUbuntu-24.04\r\n".encode_utf16() {
            utf16.extend_from_slice(&unit.to_le_bytes());
        }
        assert_eq!(
            super::decode_wsl_list(&utf16),
            "kali-linux\r\nUbuntu-24.04",
            "UTF-16LE 的换行与空格必须被规范化"
        );
        assert_eq!(
            super::decode_wsl_list(b" docker-desktop\n"),
            "docker-desktop",
            "纯 UTF-8 输出也要能读"
        );
    }

    #[test]
    fn base64_encode_pads_correctly() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"q"), "cQ==");
        assert_eq!(base64_encode(b"qi"), "cWk=");
        assert_eq!(base64_encode(b"qibox"), "cWlib3g=");
    }

    #[test]
    fn image_mime_accepts_common_formats_only() {
        assert_eq!(image_mime(Path::new("C:/a/b.PNG")), Some("image/png"));
        assert_eq!(image_mime(Path::new("a.jpeg")), Some("image/jpeg"));
        assert_eq!(image_mime(Path::new("a.webp")), Some("image/webp"));
        assert_eq!(image_mime(Path::new("a.exe")), None);
        assert_eq!(image_mime(Path::new("a")), None);
    }
}
