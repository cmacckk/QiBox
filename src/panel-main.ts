import './styles/base.css';
import './styles/app-shell.css';
import type { PanelArg, PanelRequest } from './domain/types';
import { applyAppearance } from './ui/appearance';
import { appRoot, icons, toast } from './ui/dom';
import { bindMenuDismissal } from './ui/menus';
import { setPanelCloseHandler, type PanelContext, type PanelSpec } from './ui/panels/context';
import { PANEL_SIZES, panelSpec } from './ui/panels/registry';
import { store } from './state/store';
import { bootState, startPersistence } from './state/persistence';
import { appPaths, isDesktop } from './services/desktop';
import {
  closePanelWindow,
  listenPanelRequests,
  resizePanelWindow,
  takePendingPanel,
} from './services/desktop';

interface Frame {
  panel: string;
  arg: PanelArg;
}

const stack: Frame[] = [];

function parseArg(raw: string | null): PanelArg {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as PanelArg;
  } catch {
    toast('面板参数不是合法 JSON，已按空参数打开');
  }
  return {};
}

function specOf(frame: Frame): PanelSpec {
  return panelSpec(frame.panel);
}

async function syncWindow(): Promise<void> {
  const frame = stack[stack.length - 1];
  if (!frame) return;
  const spec = specOf(frame);
  const title = typeof spec.title === 'function' ? spec.title(frame.arg) : spec.title;
  await resizePanelWindow(PANEL_SIZES[spec.size ?? 'large'], title);
}

let ready = false;

function renderTop(): void {
  // bootState 会触发 store 通知，此时面板栈还没建好，不能当作“关闭窗口”。
  if (!ready) return;
  const frame = stack[stack.length - 1];
  if (!frame) {
    void closePanelWindow();
    return;
  }
  const spec = specOf(frame);
  const ctx: PanelContext = {
    arg: frame.arg,
    open(panel: string, arg: PanelArg = {}) {
      stack.push({ panel, arg });
      renderTop();
      void syncWindow();
    },
    close() {
      stack.pop();
      if (!stack.length) {
        void closePanelWindow();
        return;
      }
      renderTop();
      void syncWindow();
    },
    refresh() {
      renderTop();
    },
  };
  setPanelCloseHandler(() => ctx.close());
  spec.render(ctx);
  icons();
}

function start(frames: Frame[]): void {
  stack.length = 0;
  stack.push(...frames);
  ready = true;
  renderTop();
  void syncWindow();
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const target = event.target as HTMLElement | null;
  const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  const menu = document.querySelector<HTMLElement>('.mn-menu');
  if (menu && !menu.hidden) {
    menu.hidden = true;
    return;
  }
  if (typing) {
    (target as HTMLInputElement).blur();
    return;
  }
  const frame = stack[stack.length - 1];
  if (!frame) return;
  stack.pop();
  if (stack.length) {
    renderTop();
    void syncWindow();
  } else {
    void closePanelWindow();
  }
});

const params = new URLSearchParams(window.location.search);
const panel = params.get('panel') ?? '';
const arg = parseArg(params.get('arg'));

setPanelCloseHandler(() => void closePanelWindow());
bindMenuDismissal(appRoot());
store.subscribeRemote(() => {
  applyAppearance(store.state);
  renderTop();
});
applyAppearance(store.state);

const incoming: PanelRequest[] = [];
let booted = false;

function applyRequest(request: PanelRequest): void {
  start([{ panel: request.panel, arg: parseArg(request.arg) }]);
}

void listenPanelRequests((request) => {
  if (booted) applyRequest(request);
  else incoming.push(request);
});

async function boot(): Promise<void> {
  // 面板窗口是独立 webview，读同一份磁盘配置后再渲染，避免与主窗口不一致。
  await bootState();
  if (isDesktop()) await appPaths();
  startPersistence();
  applyAppearance(store.state);
  booted = true;
  const pending = (await takePendingPanel()) ?? incoming.shift() ?? null;
  incoming.length = 0;
  if (pending) applyRequest(pending);
  else if (panel) start([{ panel, arg }]);
  else start([{ panel: 'settings', arg: { page: '常规' } }]);
}

void boot();
