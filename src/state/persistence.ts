import { isDesktop, readConfigFile, writeConfigFile } from '../services/desktop';
import { store } from './store';

let started = false;
let saveTimer: number | null = null;

/**
 * 桌面端启动时把 %AppData%\QiBox\config.json 读进内存。
 * 浏览器预览继续用 localStorage，不打扰已确认的演示数据。
 */
export async function bootState(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const raw = await readConfigFile();
    if (!raw) return;
    store.hydrate(JSON.parse(raw));
  } catch (error) {
    console.error('读取配置文件失败，改用默认数据', error);
  }
}

/** 首次运行时把默认配置落盘，保证数据目录与配置文件存在。 */
export function ensureConfigFile(): void {
  if (!isDesktop()) return;
  scheduleSave();
}

/** 状态变化后延迟落盘，避免连续操作时反复写文件。 */
export function startPersistence(): void {
  if (!isDesktop() || started) return;
  started = true;
  store.subscribe(() => scheduleSave());
  window.addEventListener('beforeunload', () => flushSave());
}

export function scheduleSave(): void {
  if (!isDesktop()) return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void writeConfigFile(JSON.stringify(store.state));
  }, 400);
}

export function flushSave(): void {
  if (!isDesktop()) return;
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  void writeConfigFile(JSON.stringify(store.state));
}
