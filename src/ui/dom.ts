import { createIcons, icons as lucideIcons } from 'lucide';

/** 去掉 SVG/HTML 标签外的空白，避免 textContent 带入缩进。 */
export function E<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 图标占位：由 createIcons 在渲染末尾统一替换成内联 SVG。 */
export function I(name: string): HTMLElement {
  const node = E('i');
  node.dataset.lucide = name;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

let iconFrame = 0;

/** 合并同一帧内的多次调用，避免重复遍历整个文档。 */
export function icons(): void {
  if (iconFrame) return;
  iconFrame = requestAnimationFrame(() => {
    iconFrame = 0;
    createIcons({ icons: lucideIcons, attrs: { width: '15', height: '15', 'stroke-width': '1.75' } });
  });
}

export function B(
  text: string,
  onClick: (event: MouseEvent) => void,
  className = 'mn-btn',
  icon?: string,
): HTMLButtonElement {
  const node = E('button', `${className} cursor-interaction`);
  node.type = 'button';
  if (icon) node.append(I(icon));
  if (text) node.append(document.createTextNode(text));
  node.addEventListener('click', onClick);
  return node;
}

let toastTimer = 0;

export function toast(message: string): void {
  const node = document.querySelector<HTMLElement>('.mn-toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.hidden = true;
  }, 2500);
}

export function appRoot(): HTMLElement {
  const root = document.getElementById('nano-interface');
  if (!root) throw new Error('缺少 #nano-interface 宿主节点');
  return root;
}

export function stageEl(): HTMLElement {
  const stage = appRoot().querySelector<HTMLElement>('.mn-stage');
  if (!stage) throw new Error('缺少 .mn-stage 容器');
  return stage;
}
