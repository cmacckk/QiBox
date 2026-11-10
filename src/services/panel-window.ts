import type { PanelArg } from '../domain/types';
import { openPanelWindow } from './desktop';
import { PANEL_SIZES, panelSpec } from '../ui/panels/registry';

/**
 * 主窗口打开面板：标题与尺寸取自面板注册表，
 * 前端只维护一份规格，Rust 侧按传入尺寸建窗口。
 */
export async function openPanel(panel: string, arg: PanelArg = {}): Promise<void> {
  const spec = panelSpec(panel);
  const size = PANEL_SIZES[spec.size ?? 'large'];
  const title = typeof spec.title === 'function' ? spec.title(arg) : spec.title;
  await openPanelWindow({
    panel,
    arg: JSON.stringify(arg),
    width: size.width,
    height: size.height,
    title,
  });
}
