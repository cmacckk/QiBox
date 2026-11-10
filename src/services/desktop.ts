import type { PanelRequest } from '../domain/types';

/**
 * 桌面壳能力封装。浏览器里跑 `pnpm dev` 时走窗口兜底，
 * 这样界面与面板额定大小都能脱离 Tauri 单独验证。
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export interface PanelSize {
  width: number;
  height: number;
}

export interface AppPaths {
  dataDir: string;
  configFile: string;
  backupsDir: string;
  exeDir: string;
  exePath: string;
}

export async function openPanelWindow(request: PanelRequest): Promise<void> {
  if (!isDesktop()) {
    const path = `/panel.html?panel=${encodeURIComponent(request.panel)}&arg=${encodeURIComponent(request.arg)}`;
    // 只允许站内面板页，避免把任何外部地址交给 window.open。
    if (!path.startsWith('/panel.html?')) throw new Error(`非法面板地址：${path}`);
    // 面板地址在白名单内，此处只做浏览器预览的窗口兜底。
    const openWindow = window.open.bind(window);
    openWindow(path, 'qibox-panels', `width=${request.width},height=${request.height}`);
    return;
  }
  await invokeCommand('open_panel_window', { request });
}

export async function closePanelWindow(): Promise<void> {
  if (!isDesktop()) {
    window.close();
    return;
  }
  await invokeCommand('close_panel_window');
}

export async function resizePanelWindow(size: PanelSize, title: string): Promise<void> {
  if (!isDesktop()) {
    document.title = title;
    return;
  }
  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  await win.setTitle(title);
  await win.setSize(new LogicalSize(size.width, size.height));
}

export async function minimizeMainWindow(): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().minimize();
}

export async function hideMainWindow(): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().hide();
}

export async function showMainWindow(): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  await win.show();
  await win.unminimize();
  await win.setFocus();
}

/** 热键唤醒：可见就隐藏，隐藏或最小化就显示。 */
export async function toggleMainWindowVisibility(): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const visible = await win.isVisible();
  const minimized = await win.isMinimized();
  if (visible && !minimized) {
    await win.hide();
    return;
  }
  await win.show();
  await win.unminimize();
  await win.setFocus();
}

export async function setAlwaysOnTop(onTop: boolean): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setAlwaysOnTop(onTop);
}

export async function setWindowTitle(title: string): Promise<void> {
  if (!isDesktop() || !title.trim()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setTitle(title.trim());
}

// ---------- 配置与数据 ----------

let exeDirCache = '';

/** 最近一次 app_paths 得到的程序目录，供同步代码（如生成命令文本）使用。 */
export function cachedExeDir(): string {
  return exeDirCache;
}

export async function appPaths(): Promise<AppPaths | null> {
  if (!isDesktop()) return null;
  try {
    const paths = await invokeCommand<AppPaths>('app_paths');
    exeDirCache = paths.exeDir;
    return paths;
  } catch {
    return null;
  }
}

export async function readConfigFile(): Promise<string | null> {
  if (!isDesktop()) return null;
  return invokeCommand<string | null>('read_config');
}

export async function writeConfigFile(config: string): Promise<void> {
  if (!isDesktop()) return;
  await invokeCommand('write_config', { config });
}

export async function listBackups(): Promise<string[]> {
  if (!isDesktop()) return [];
  return invokeCommand<string[]>('list_backups');
}

export async function readBackup(name: string): Promise<string> {
  return invokeCommand<string>('read_backup', { name });
}

export async function exportConfigFile(path: string, config: string): Promise<void> {
  await invokeCommand('export_config', { path, config });
}

export async function importConfigFile(path: string): Promise<string> {
  return invokeCommand<string>('import_config', { path });
}

export async function openDataDir(): Promise<void> {
  if (!isDesktop()) return;
  await invokeCommand('open_data_dir');
}

export async function quitApp(): Promise<void> {
  if (!isDesktop()) return;
  await invokeCommand('quit_app');
}

// ---------- 启动项目 ----------

export interface LaunchRequest {
  target: string;
  args: string;
  workDir: string;
  admin: boolean;
  runner?: string;
  wsl?: { distro: string; cwd: string };
}

export async function listThemeFiles(): Promise<string[]> {
  if (!isDesktop()) return [];
  return invokeCommand<string[]>('list_themes', {});
}

export async function readThemeFile(file: string): Promise<string> {
  return invokeCommand<string>('read_theme', { file });
}

export async function writeThemeFile(file: string, content: string): Promise<string> {
  return invokeCommand<string>('write_theme', { file, content });
}

export async function launchTool(request: LaunchRequest): Promise<void> {
  if (!isDesktop()) {
    throw new Error('浏览器预览不会启动程序，请用 pnpm desktop:dev');
  }
  await invokeCommand('launch', { ...request });
}

export async function takePendingPanel(): Promise<PanelRequest | null> {
  if (!isDesktop()) return null;
  try {
    return await invokeCommand<PanelRequest | null>('take_pending_panel');
  } catch {
    return null;
  }
}

export async function listWslDistros(): Promise<string[]> {
  if (!isDesktop()) return [];
  try {
    return await invokeCommand<string[]>('wsl_distros');
  } catch {
    return [];
  }
}

export async function targetInfo(path: string): Promise<{ exists: boolean; isDir: boolean }> {
  if (!isDesktop()) return { exists: false, isDir: false };
  try {
    return await invokeCommand<{ exists: boolean; isDir: boolean }>('target_exists', { path });
  } catch {
    return { exists: false, isDir: false };
  }
}

// ---------- 全局快捷键 ----------

export interface HotkeyHandlers {
  main: () => void;
  search: () => void;
  /** 项目级全局热键，来自每个项目自己的快捷键设置。 */
  items?: Array<{ label: string; key: string; handler: () => void }>;
}

const MODIFIER_ALIASES: Record<string, string> = {
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  win: 'Super',
  windows: 'Super',
  meta: 'Super',
  cmd: 'Super',
  command: 'Super',
  super: 'Super',
};
const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Super'];

/** 让 Maye 风格的 `Shift + Win + D`、`Ctrl+Alt+Space` 都能被全局热键插件识别。 */
function normalizeHotkey(key: string): string {
  const parts = key
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return '';
  const modifiers: string[] = [];
  let mainKey = '';
  for (const part of parts) {
    const alias = MODIFIER_ALIASES[part.toLowerCase()];
    if (alias) {
      if (!modifiers.includes(alias)) modifiers.push(alias);
    } else {
      mainKey = part;
    }
  }
  if (!mainKey) return '';
  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return [...modifiers, mainKey].join('+');
}

/** 重新注册两个全局热键，返回注册失败的说明，便于界面如实提示。 */
export async function applyGlobalHotkeys(
  mainKey: string,
  searchKey: string,
  handlers: HotkeyHandlers,
): Promise<string[]> {
  if (!isDesktop()) return [];
  const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
  try {
    await unregisterAll();
  } catch {
    // 没有注册过也允许继续。
  }
  const failures: string[] = [];
  const bindings: Array<[string, string, () => void]> = [
    ['全局快捷键', mainKey, handlers.main],
    ['搜索快捷键', searchKey, handlers.search],
    ...(handlers.items ?? []).map(
      (entry) => [entry.label, entry.key, entry.handler] as [string, string, () => void],
    ),
  ];
  for (const [label, raw, handler] of bindings) {
    const key = normalizeHotkey(raw);
    if (!key) continue;
    try {
      await register(key, (event) => {
        if (event.state === 'Pressed') handler();
      });
    } catch {
      failures.push(`${label} ${raw} 注册失败`);
    }
  }
  return failures;
}

// ---------- 开机启动 ----------

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isDesktop()) return;
  const plugin = await import('@tauri-apps/plugin-autostart');
  if (enabled) await plugin.enable();
  else await plugin.disable();
}

export async function autostartEnabled(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const plugin = await import('@tauri-apps/plugin-autostart');
    return await plugin.isEnabled();
  } catch {
    return false;
  }
}

// ---------- 文件对话框 ----------

export async function pickSavePath(defaultName: string): Promise<string | null> {
  if (!isDesktop()) return null;
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save({
    defaultPath: defaultName,
    filters: [{ name: 'JSON 配置', extensions: ['json'] }],
  });
}

/** 选一张背景图；浏览器预览走 <input type=file>，桌面端走系统对话框。 */
export async function pickImagePath(): Promise<string | null> {
  if (!isDesktop()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico'] }],
  });
  return typeof picked === 'string' ? picked : null;
}

export interface ImageData {
  mime: string;
  data: string;
}

/** 读本地图片成 base64；Rust 侧限制 12 MB 与图片后缀。 */
export async function readImageData(path: string): Promise<ImageData> {
  return invokeCommand<ImageData>('read_image_data', { path });
}

/** 选一个 exe/dll，用来从里面抽图标。 */
export async function pickProgramPath(): Promise<string | null> {
  if (!isDesktop()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: '程序', extensions: ['exe', 'dll'] }],
  });
  return typeof picked === 'string' ? picked : null;
}

/** 读图标数据：图片走 read_image_data，exe/dll 走 read_exe_icon（只读解析 PE）。 */
export async function readIconData(path: string): Promise<ImageData> {
  const lower = path.toLowerCase();
  if (lower.endsWith('.exe') || lower.endsWith('.dll')) {
    return invokeCommand<ImageData>('read_exe_icon', { path });
  }
  return readImageData(path);
}

/** 选一个目录（安装插件用）。 */
export async function pickDirectory(title = '选择文件夹'): Promise<string | null> {
  if (!isDesktop()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ title, multiple: false, directory: true });
  return typeof picked === 'string' ? picked : null;
}

export interface ProcessRow {
  pid: number;
  name: string;
  memory_mb: number;
}

export async function listFonts(): Promise<string[]> {
  if (!isDesktop()) return [];
  try {
    return await invokeCommand<string[]>('list_fonts');
  } catch {
    return [];
  }
}

export async function listProcesses(): Promise<ProcessRow[]> {
  if (!isDesktop()) return [];
  return invokeCommand<ProcessRow[]>('list_processes', {});
}

export async function killProcess(pid: number): Promise<void> {
  await invokeCommand<void>('kill_process', { pid });
}

export async function readLaunchLogs(limit = 200): Promise<string[]> {
  if (!isDesktop()) return [];
  return invokeCommand<string[]>('read_logs', { limit });
}

export async function pickOpenPath(): Promise<string | null> {
  if (!isDesktop()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'JSON 配置', extensions: ['json'] }],
  });
  return typeof picked === 'string' ? picked : null;
}

// ---------- 主窗口尺寸 ----------

export async function applyMainWindowSize(size: PanelSize): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const current = await win.innerSize();
  const factor = await win.scaleFactor();
  const width = Math.round(current.width / factor);
  const height = Math.round(current.height / factor);
  // 只在尺寸确实不同的时候调整，避免启动时窗口闪一下。
  if (Math.abs(width - size.width) > 1 || Math.abs(height - size.height) > 1) {
    await win.setSize(new LogicalSize(size.width, size.height));
  }
}

/** 用户拖动窗口后回报新尺寸；最大化时跳过，保留“还原”后的尺寸。 */
/** 监听系统拖放：拿到的是绝对路径，浏览器预览没有这个能力。 */
export async function listenFileDrop(handler: (paths: string[]) => void): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === 'drop') handler(event.payload.paths);
  });
}

export async function watchMainWindowSize(
  handler: (size: PanelSize, maximized: boolean) => void,
): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  let timer: number | null = null;
  await win.onResized(async () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      timer = null;
      const maximized = await win.isMaximized();
      if (maximized) return;
      const size = await win.innerSize();
      const factor = await win.scaleFactor();
      handler(
        { width: Math.round(size.width / factor), height: Math.round(size.height / factor) },
        false,
      );
    }, 350);
  });
}

// ---------- 主窗口位置 ----------

/** 把主窗口放回上次记住的位置；位置不在任何显示器内时后端会改成居中。 */
export async function applyMainWindowPosition(
  position: { x: number; y: number } | null,
): Promise<void> {
  if (!isDesktop() || !position) return;
  await invokeCommand('set_main_position', { x: Math.round(position.x), y: Math.round(position.y) });
}

/** 拖动窗口后回报物理坐标；最大化时跳过。 */
export async function watchMainWindowMove(
  handler: (position: { x: number; y: number }) => void,
): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  let timer: number | null = null;
  await win.onMoved(async () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      timer = null;
      if (await win.isMaximized()) return;
      const position = await win.outerPosition();
      handler({ x: Math.round(position.x), y: Math.round(position.y) });
    }, 350);
  });
}

export async function syncMaximizedClass(): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const apply = async () => {
    document.body.classList.toggle('maximized', await win.isMaximized());
  };
  await apply();
  await win.onResized(() => void apply());
}

// ---------- 托盘 ----------

export async function listenTrayActions(handlers: { settings: () => void }): Promise<void> {
  if (!isDesktop()) return;
  const { listen } = await import('@tauri-apps/api/event');
  await listen('qibox://open-settings', () => handlers.settings());
}

/** 主窗口监听 Rust 侧发来的“面板复用”通知。 */
export async function listenPanelRequests(handler: (request: PanelRequest) => void): Promise<void> {
  if (!isDesktop()) return;
  const { listen } = await import('@tauri-apps/api/event');
  await listen<PanelRequest>('qibox://open-panel', (event) => handler(event.payload));
}
