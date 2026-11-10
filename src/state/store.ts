import { DEFAULT_FAVORITES, DEFAULT_VALUES, CATEGORIES, defaultTasks, seedItems } from '../data/catalog';
import type { AppState, SettingValue } from '../domain/types';

const STORAGE_KEY = 'qibox.state.v1';
const CHANNEL_NAME = 'qibox.state';

/** 首次启动 / 恢复默认时的窗口尺寸；最小尺寸与 tauri.conf.json 保持一致。 */
export const DEFAULT_WINDOW_SIZE = { width: 380, height: 560 };
const MIN_WINDOW = { width: 360, height: 520 };

export function normalizeWindowSize(
  value: unknown,
  fallback: { width: number; height: number } = DEFAULT_WINDOW_SIZE,
): { width: number; height: number } {
  const source = (value ?? {}) as { width?: unknown; height?: unknown };
  const width = typeof source.width === 'number' ? Math.round(source.width) : NaN;
  const height = typeof source.height === 'number' ? Math.round(source.height) : NaN;
  // 410×569 是设计稿尺寸，已是旧默认值；统一换成更窄的新默认，避免老配置把窗口“还原”回宽版。
  if (width === 410 && height === 569) return { ...DEFAULT_WINDOW_SIZE };
  return {
    width: Number.isFinite(width) ? Math.max(MIN_WINDOW.width, width) : fallback.width,
    height: Number.isFinite(height) ? Math.max(MIN_WINDOW.height, height) : fallback.height,
  };
}

function normalizeWindowPosition(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as { x?: unknown; y?: unknown };
  const x = typeof source.x === 'number' ? Math.round(source.x) : NaN;
  const y = typeof source.y === 'number' ? Math.round(source.y) : NaN;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function initialState(): AppState {
  return {
    schema: 1,
    categories: [...CATEGORIES],
    items: seedItems(),
    favorites: [...DEFAULT_FAVORITES],
    tasks: defaultTasks(),
    passwords: {},
    values: { ...DEFAULT_VALUES },
    view: 'list',
    pinned: false,
    category: CATEGORIES[0],
    accent: '#516fd1',
    radius: 6,
    tint: '#ffffff',
    windowSize: { ...DEFAULT_WINDOW_SIZE },
    windowPosition: null,
  };
}

function normalizePasswords(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [category, password] of Object.entries(value as Record<string, unknown>)) {
    if (typeof password === 'string' && password.length > 0) out[category] = password;
  }
  return out;
}

/** 早期 Maye 迁移写进过「隐藏到托盘」，统一成设置面板里的取值。 */
function normalizeValues(values: Record<string, SettingValue>): Record<string, SettingValue> {
  if (values['关闭按钮执行动作'] === '隐藏到托盘') values['关闭按钮执行动作'] = '隐藏';
  return values;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // 只接受结构完整的存档；缺字段时回退到初始演示数据，避免半截状态渲染崩溃。
    if (parsed.schema !== 1 || !Array.isArray(parsed.items) || !Array.isArray(parsed.categories)) {
      return initialState();
    }
    const base = initialState();
    const size = parsed.windowSize;
    return {
      ...base,
      ...parsed,
      values: normalizeValues({ ...base.values, ...(parsed.values ?? {}) }),
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : base.favorites,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : base.tasks,
      passwords: normalizePasswords(parsed.passwords),
      windowSize: normalizeWindowSize(size, base.windowSize),
      windowPosition: normalizeWindowPosition(parsed.windowPosition),
    };
  } catch {
    return initialState();
  }
}

let state = load();
const listeners = new Set<(next: AppState) => void>();
const remoteListeners = new Set<(next: AppState) => void>();

const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;

channel?.addEventListener('message', (event: MessageEvent<{ type: string; state: AppState }>) => {
  if (event.data?.type !== 'state' || !event.data.state) return;
  state = event.data.state;
  notify();
  for (const listener of remoteListeners) listener(state);
});

function notify(): void {
  for (const listener of listeners) listener(state);
}

function post(): void {
  channel?.postMessage({ type: 'state', state });
}

export const store = {
  get state(): AppState {
    return state;
  },

  subscribe(listener: (next: AppState) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** 只关心“别的窗口改了什么”，自己写入时不触发，避免面板自己重建自己。 */
  subscribeRemote(listener: (next: AppState) => void): () => void {
    remoteListeners.add(listener);
    return () => remoteListeners.delete(listener);
  },

  /** 所有写入都走这里：改状态、落盘、通知本窗口与其它窗口。 */
  update(mutator: (draft: AppState) => void): void {
    mutator(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('QiBox 状态写入失败', error);
    }
    notify();
    post();
  },

  setValue(label: string, value: SettingValue): void {
    store.update((draft) => {
      draft.values[label] = value;
    });
  },

  /** 桌面端启动时用磁盘配置替换内存状态（不动 localStorage）。 */
  hydrate(next: unknown): void {
    if (!next || typeof next !== 'object') return;
    const parsed = next as Partial<AppState>;
    if (parsed.schema !== 1 || !Array.isArray(parsed.items) || !Array.isArray(parsed.categories)) return;
    const base = initialState();
    const size = parsed.windowSize;
    state = {
      ...base,
      ...parsed,
      values: normalizeValues({ ...base.values, ...(parsed.values ?? {}) }),
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : base.favorites,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : base.tasks,
      passwords: normalizePasswords(parsed.passwords),
      windowSize: normalizeWindowSize(size, base.windowSize),
      windowPosition: normalizeWindowPosition(parsed.windowPosition),
    };
    notify();
    post();
  },

  setAccent(accent: string): void {
    store.update((draft) => {
      draft.accent = accent;
    });
  },

  reset(): void {
    state = initialState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('QiBox 状态重置失败', error);
    }
    notify();
    post();
  },
};
