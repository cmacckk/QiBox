import { DARK_THEMES } from '../data/catalog';
import type { AppState } from '../domain/types';
import { syncBackground } from './background';

/** 外观变量来自设置面板，两个窗口共用同一份状态。 */
export function applyAppearance(state: AppState): void {
  const root = document.getElementById('nano-interface') ?? document.documentElement;
  root.style.setProperty('--mn-accent', state.accent);
  root.style.setProperty('--mn-radius', `${state.radius}px`);
  // 深色主题只切一个类，具体颜色全在 base.css 的 .mn-dark 里。
  root.classList.toggle('mn-dark', DARK_THEMES.has(String(state.values['主题'] ?? '')));
  const font = String(state.values['界面字体'] ?? 'Segoe UI').trim() || 'Segoe UI';
  root.style.setProperty('--mn-font', `"${font.replace(/"/g, '')}"`);
  // 背景图是异步读的，这里不阻塞渲染；读到之后会自己重画。
  void syncBackground(state);
}

export const VIEW_CLASSES = ['view-icons', 'view-tiles'] as const;
export const CATEGORY_CLASSES = ['cats-right', 'cats-top', 'cats-bottom', 'cats-none'] as const;

/** 项目显示类型 → 列表 / 图标 / 平铺。 */
export function viewModeOf(state: AppState): 'list' | 'icons' | 'tiles' {
  return state.view;
}

export function iconSizeOf(state: AppState): string {
  const label = String(state.values['项目图标尺寸'] ?? '小图标');
  if (label === '中图标') return '29px';
  if (label === '大图标') return '36px';
  return '22px';
}

export function categoryPlacementOf(state: AppState): 'left' | 'right' | 'top' | 'bottom' | 'none' {
  const label = String(state.values['分类显示位置'] ?? '左侧');
  if (label === '右侧') return 'right';
  if (label === '顶部') return 'top';
  if (label === '底部') return 'bottom';
  if (label === '隐藏') return 'none';
  return 'left';
}
