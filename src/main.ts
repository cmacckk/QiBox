import './styles/base.css';
import './styles/app-shell.css';
import { bootState, ensureConfigFile, startPersistence } from './state/persistence';
import { store } from './state/store';
import { applyAppearance } from './ui/appearance';
import { appRoot } from './ui/dom';
import { mountMainWindow } from './ui/main-window';
import { bindMenuDismissal } from './ui/menus';

async function start(): Promise<void> {
  // 桌面端优先读磁盘配置，浏览器预览继续用 localStorage。
  await bootState();
  applyAppearance(store.state);
  bindMenuDismissal(appRoot());
  await mountMainWindow();
  startPersistence();
  ensureConfigFile();
}

void start();
