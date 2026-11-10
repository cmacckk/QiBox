import { readIconData } from '../services/desktop';

/**
 * 图片/程序图标：配置里存 `file:<路径>`（可相对、可带 %mp% 等变量），
 * 调用方先把路径解析成绝对路径，这里只负责读图并缓存 data URL，避免每帧重复读盘。
 */
const cache = new Map<string, string>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

/** 配置值是不是 `file:` 形式的图片/程序图标。 */
export function isFileIcon(icon: string | undefined): boolean {
  return typeof icon === 'string' && icon.startsWith('file:');
}

/** 取已缓存的 data URL；还没读到返回 null。 */
export function imageIconUrl(path: string): string | null {
  return cache.get(path) ?? null;
}

export function onImageIconsLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function primeImageIcons(paths: Array<string | null>): void {
  const pending: string[] = [];
  for (const path of paths) {
    if (!path || cache.has(path) || loading.has(path)) continue;
    loading.add(path);
    pending.push(path);
  }
  if (!pending.length) return;
  const loads: Promise<void>[] = [];
  for (const path of pending) {
    loads.push(loadIcon(path));
  }
  void Promise.all(loads).then(() => {
    for (const listener of listeners) listener();
  });
}

async function loadIcon(path: string): Promise<void> {
  try {
    const data = await readIconData(path);
    cache.set(path, `data:${data.mime};base64,${data.data}`);
  } catch {
    cache.set(path, '');
  } finally {
    loading.delete(path);
  }
}
