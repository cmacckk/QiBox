import { B, E, icons, stageEl } from './dom';

export interface MenuEntry {
  text: string;
  fn?: () => void;
  icon?: string;
  hint?: string;
  checked?: boolean;
  danger?: boolean;
  children?: MenuItem[] | (() => MenuItem[]);
}

export type MenuItem = MenuEntry | null;

interface MenuBack {
  name: string;
  entries: MenuItem[];
  parent?: MenuBack;
}

function menuEl(): HTMLElement {
  const menu = document.querySelector<HTMLElement>('.mn-menu');
  if (!menu) throw new Error('缺少 .mn-menu 容器');
  return menu;
}

export function closeMenus(): void {
  menuEl().hidden = true;
}

/**
 * 在舞台内定位菜单：以事件坐标为准，并夹在舞台可视区域内，避免被窗口边缘裁切。
 * children 为下级菜单构造器，点击后在原位置替换并保留“返回”层。
 */
export function openMenu(entries: MenuItem[], event?: MouseEvent, back?: MenuBack): void {
  const menu = menuEl();
  const stage = stageEl();
  menu.replaceChildren();

  if (back) {
    menu.append(
      B(
        back.name,
        () => openMenu(back.entries, event, back.parent),
        'mn-menu-back',
        'chevron-left',
      ),
    );
  }

  for (const entry of entries) {
    if (entry === null) {
      menu.append(E('div', 'mn-menu-separator'));
      continue;
    }
    const node = B(
      '',
      () => {
        if (entry.children) {
          openMenu(typeof entry.children === 'function' ? entry.children() : entry.children, event, {
            name: entry.text,
            entries,
            parent: back,
          });
          return;
        }
        menu.hidden = true;
        entry.fn?.();
      },
      `mn-menu-item${entry.danger ? ' danger' : ''}`,
    );
    node.setAttribute('role', 'menuitem');
    if (entry.icon) node.append(iconEl(entry.icon));
    else if (entry.checked !== undefined) node.append(iconEl(entry.checked ? 'check' : 'minus'));
    else node.append(E('span'));
    node.append(E('span', 'mn-menu-text', entry.text));
    if (entry.children) node.append(iconEl('chevron-right'));
    else if (entry.hint) node.append(E('span', 'mn-menu-hint', entry.hint));
    menu.append(node);
  }

  menu.hidden = false;
  icons();

  const bounds = stage.getBoundingClientRect();
  const x = event?.clientX !== undefined ? event.clientX - bounds.left : bounds.width / 2 + 12;
  const y = event?.clientY !== undefined ? event.clientY - bounds.top : 36;
  menu.style.left = `${Math.max(4, Math.min(bounds.width - menu.offsetWidth - 4, x))}px`;
  menu.style.top = `${Math.max(4, Math.min(bounds.height - menu.offsetHeight - 4, y))}px`;
}

function iconEl(name: string): HTMLElement {
  const node = E('i');
  node.dataset.lucide = name;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** 点击菜单与触发器之外的区域时收起菜单。 */
export function bindMenuDismissal(root: HTMLElement): void {
  root.addEventListener('click', (event) => {
    const path = event.composedPath();
    const keep = path.some(
      (node) =>
        node instanceof Element &&
        node.matches(
          '.mn-menu, [data-act=mainmenu], [data-act=newmenu], .mn-pluginhead .mn-iconbutton',
        ),
    );
    if (!keep) closeMenus();
  });
  root.addEventListener('contextmenu', () => closeMenus(), true);
}
