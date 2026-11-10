import type { AppState } from '../domain/types';
import { isDesktop, pickImagePath, readImageData } from '../services/desktop';
import { store } from '../state/store';
import { toast } from './dom';

/** 背景图在 config.json 里只存路径，图片本体按需读取后缓存在内存里。 */
let cachedPath = '';
let cachedUrl = '';
let loading = false;

const FITS: Record<string, { size: string; repeat: string; position: string }> = {
  居中缩放: { size: 'contain', repeat: 'no-repeat', position: 'center' },
  等比缩放: { size: 'cover', repeat: 'no-repeat', position: 'center' },
  缩放: { size: '100% 100%', repeat: 'no-repeat', position: 'center' },
  平铺: { size: 'auto', repeat: 'repeat', position: 'top left' },
  不重复: { size: 'auto', repeat: 'no-repeat', position: 'center' },
};

function backgroundPath(state: AppState): string {
  const value = state.values['背景图片'];
  return typeof value === 'string' ? value.trim() : '';
}

function paint(state: AppState, url: string): void {
  const root = document.documentElement;
  const fit = FITS[String(state.values['背景图类型'] ?? '等比缩放')] ?? FITS['等比缩放'];
  const opacity = Number(state.values['背景图透明度'] ?? 100);
  root.style.setProperty('--mn-bg-image', url ? `url("${url}")` : 'none');
  root.style.setProperty('--mn-bg-size', fit.size);
  root.style.setProperty('--mn-bg-repeat', fit.repeat);
  root.style.setProperty('--mn-bg-position', fit.position);
  root.style.setProperty('--mn-bg-opacity', String(Math.min(100, Math.max(0, opacity)) / 100));
  const app = document.querySelector('.mn-app');
  app?.classList.toggle('has-bg', Boolean(url));
}

/** 路径变化才重新读图；设置里改类型/透明度会立刻重画。 */
export async function syncBackground(state: AppState): Promise<void> {
  const path = backgroundPath(state);
  if (!path) {
    cachedPath = '';
    cachedUrl = '';
    paint(state, '');
    return;
  }
  if (path === cachedPath && cachedUrl) {
    paint(state, cachedUrl);
    return;
  }
  if (path.startsWith('data:')) {
    cachedPath = path;
    cachedUrl = path;
    paint(state, path);
    return;
  }
  if (loading) return;
  loading = true;
  try {
    const image = await readImageData(path);
    cachedPath = path;
    cachedUrl = `data:${image.mime};base64,${image.data}`;
    paint(store.state, cachedUrl);
  } catch (error) {
    cachedPath = '';
    cachedUrl = '';
    paint(state, '');
    toast(`背景图加载失败：${String(error)}`);
  } finally {
    loading = false;
  }
}

/** 浏览器预览读不到任意本地路径，用文件选择器转 data URL，只在本次会话生效。 */
function pickInBrowser(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    input.click();
  });
}

export async function chooseBackground(): Promise<void> {
  try {
    let path: string | null = null;
    if (isDesktop()) {
      path = await pickImagePath();
      if (path) {
        const image = await readImageData(path);
        cachedPath = path;
        cachedUrl = `data:${image.mime};base64,${image.data}`;
      }
    } else {
      const dataUrl = await pickInBrowser();
      if (dataUrl) {
        path = dataUrl;
        cachedPath = dataUrl;
        cachedUrl = dataUrl;
      }
    }
    if (!path) return;
    store.setValue('背景图片', path);
    paint(store.state, cachedUrl);
    toast('背景图已应用');
  } catch (error) {
    toast(`背景图加载失败：${String(error)}`);
  }
}

export function clearBackground(): void {
  cachedPath = '';
  cachedUrl = '';
  store.setValue('背景图片', '');
  paint(store.state, '');
}
