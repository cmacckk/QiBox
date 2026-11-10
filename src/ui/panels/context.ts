import type { PanelArg } from '../../domain/types';
import { B, E } from '../dom';

export type PanelSizeName = 'small' | 'medium' | 'large';

export interface PanelContext {
  arg: PanelArg;
  /** 在同一个面板窗口内打开下级面板，关闭时返回上一层。 */
  open(panel: string, arg?: PanelArg): void;
  /** 关闭当前面板；栈空时关闭窗口。 */
  close(): void;
  /** 重新绘制当前面板（标签页切换、表单重算时使用）。 */
  refresh(): void;
}

export interface PanelSpec {
  title: string | ((arg: PanelArg) => string);
  size?: PanelSizeName;
  render(ctx: PanelContext): void;
}

/** 面板窗口尺寸与设计稿一致：large 650 / medium 515 / small 390。 */
export const PANEL_SIZES: Record<PanelSizeName, { width: number; height: number }> = {
  small: { width: 390, height: 300 },
  medium: { width: 515, height: 580 },
  large: { width: 650, height: 648 },
};

let closeHandler: () => void = () => {};

export function setPanelCloseHandler(handler: () => void): void {
  closeHandler = handler;
}

export function requestPanelClose(): void {
  closeHandler();
}

function modalEl(): HTMLElement {
  const modal = document.querySelector<HTMLElement>('.mn-dialog');
  if (!modal) throw new Error('缺少 .mn-dialog 容器');
  return modal;
}

/**
 * 面板骨架：标题栏 + 内容区 + 可选底栏。
 * “界面预览”措辞改为演示态说明，避免让用户误以为能改系统。
 */
export function panelFrame(
  title: string,
  cls = '',
  withFooter = true,
): { body: HTMLElement; footer: HTMLElement | null } {
  const modal = modalEl();
  modal.className = `mn-dialog ${cls}`.trim();
  modal.replaceChildren();

  const head = E('header', 'mn-dialog-title');
  const heading = E('h2', '', title);
  heading.id = 'mn-dialog-title';
  const close = B('', () => requestPanelClose(), 'mn-iconbutton', 'x');
  close.setAttribute('aria-label', '关闭面板');
  close.dataset.role = 'panel-close';
  head.append(heading, close);
  modal.append(head);

  const body = E('div', 'mn-dialog-content');
  modal.append(body);

  let footer: HTMLElement | null = null;
  if (withFooter) {
    footer = E('footer', 'mn-dialog-footer');
    footer.append(E('span', 'mn-preview-note', '本机配置 · 修改后自动保存'));
    modal.append(footer);
  }

  modal.hidden = false;
  const scrim = document.querySelector<HTMLElement>('.mn-scrim');
  if (scrim) scrim.hidden = false;
  document.querySelector('.mn-stage')?.classList.add('has-dialog');
  return { body, footer };
}
