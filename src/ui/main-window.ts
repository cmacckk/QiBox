import { PLUGIN_DESCRIPTIONS } from '../data/catalog';
import type { ToolItem } from '../domain/types';
import { DEFAULT_TOOLS_ROOT, expandVariables, resolveTarget } from '../domain/variables';
import {
  appPaths,
  applyGlobalHotkeys,
  applyMainWindowSize,
  applyMainWindowPosition,
  autostartEnabled,
  hideMainWindow,
  isDesktop,
  launchTool,
  listenTrayActions,
  minimizeMainWindow,
  quitApp,
  setAlwaysOnTop,
  setAutostart,
  setWindowTitle,
  listenFileDrop,
  syncMaximizedClass,
  toggleMainWindowVisibility,
  watchMainWindowSize,
  watchMainWindowMove,
} from '../services/desktop';
import { openPanel } from '../services/panel-window';
import { startPersistence } from '../state/persistence';
import { store } from '../state/store';
import { hasCategoryPassword, isCategoryLocked, lockCategory } from '../state/unlock';
import { pinyin } from 'pinyin-pro';
import { imageIconUrl, isFileIcon, onImageIconsLoaded, primeImageIcons } from './image-icons';
import { bindReorder, consumeReorderClick } from './reorder';
import {
  applyAppearance,
  CATEGORY_CLASSES,
  categoryPlacementOf,
  iconSizeOf,
  viewModeOf,
} from './appearance';
import { B, E, I, icons, toast } from './dom';
import { openMenu, type MenuItem } from './menus';

const PLUGIN_KEYWORDS: Array<[string, string, string]> = [
  ['Calc', 'cale', '计算器'],
  ['Cmd', '>', '命令'],
  ['Run', '<', '运行'],
  ['Hash', '#', '哈希'],
  ['Rand', 'rd', '随机'],
];

interface UiState {
  searching: boolean;
  query: string;
  selection: Set<number>;
  folderStack: ToolItem[];
  pinned: boolean;
  activeResult: number;
}

const ui: UiState = {
  searching: false,
  query: '',
  selection: new Set<number>(),
  folderStack: [],
  pinned: false,
  activeResult: 0,
};

function must<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`主窗口缺少 ${selector}`);
  return node;
}

const app = () => must<HTMLElement>('#nano-interface .mn-app');
const categoryNav = () => must<HTMLElement>('.mn-categories');
const itemBody = () => must<HTMLElement>('.mn-itembody');
const breadcrumb = () => must<HTMLElement>('.mn-breadcrumb');
const batchbar = () => must<HTMLElement>('.mn-batchbar');
const searchbar = () => must<HTMLElement>('.mn-searchbar');
const searchInput = () => must<HTMLInputElement>('.mn-searchbar input');
const footerLeft = () => must<HTMLElement>('.mn-footer-left');
const footerHint = () => must<HTMLElement>('[data-role="footer-hint"]');

function currentParent(): string {
  return ui.folderStack.length ? ui.folderStack[ui.folderStack.length - 1].name : '';
}

function visibleItems(): ToolItem[] {
  const { items, category } = store.state;
  const parent = currentParent();
  return items.filter((item) => item.category === category && item.parent === parent);
}

function launchItem(item: ToolItem): void {
  if (item.type === 'SPACER' || item.type === 'TITLE') return;
  if (item.type === 'FOLDER') {
    ui.folderStack.push(item);
    ui.selection.clear();
    renderAll();
    return;
  }
  const context = {
    exeDir: exeDir || '%mp%',
    toolsRoot: toolsRootValue(),
    search: ui.searching ? ui.query.trim() : '',
    item,
  };
  const target = resolveTarget(expandVariables(item.target, context), exeDir || '%mp%');
  const args = expandVariables(item.args, context);
  const workDir = expandVariables(item.start, context);
  void launchTool({
    target,
    args,
    workDir,
    admin: Boolean(item.admin),
    runner: item.runner ?? '',
    wsl:
      item.env === 'wsl'
        ? { distro: item.wslDistro ?? '', cwd: item.wslCwd ?? '' }
        : undefined,
  })
    .then(() => {
      toast(`已启动「${item.name}」`);
      if (store.state.values['运行项目后隐藏主窗口'] === true) void hideMainWindow();
    })
    .catch((error: unknown) => {
      toast(error instanceof Error ? error.message : String(error));
    });
}

/** 程序目录由 Rust 提供，%mp% 展开与相对路径都依赖它。 */
let exeDir = '';

function itemIcon(item: ToolItem): string {
  if (item.icon) return item.icon;
  if (item.type === 'FOLDER') return 'folder';
  if (item.type === 'URL') return 'globe';
  if (item.type === 'SCRIPT') return 'file-code';
  if (item.type === 'TITLE') return 'type';
  if (item.type === 'BUILTIN') return 'terminal';
  return item.type === 'GUI' ? 'app-window' : 'square-terminal';
}

const pinyinCache = new Map<string, string[]>();

function pinyinKeys(text: string): string[] {
  const cached = pinyinCache.get(text);
  if (cached) return cached;
  const keys: string[] = [];
  try {
    keys.push(pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase());
    keys.push(pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase());
  } catch {
    // 纯英文/符号文本不需要拼音，出错时按无拼音处理。
  }
  pinyinCache.set(text, keys);
  return keys;
}

/** 工具根目录：设置里改过就用设置值，否则用默认目录。 */
function toolsRootValue(): string {
  const value = store.state.values['工具根目录'];
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_TOOLS_ROOT;
}

/**
 * 配置里的 `file:<路径>` 解析成绝对路径：
 * 支持相对路径（相对程序目录）、`%mp%` 等变量，也支持直接指向 exe/dll（读里面的图标）。
 */
function iconFilePath(icon: string | undefined): string | null {
  if (!isFileIcon(icon) || !icon) return null;
  const raw = icon.slice(5).trim();
  if (!raw) return null;
  const expanded = expandVariables(raw, { exeDir, toolsRoot: toolsRootValue() });
  return resolveTarget(expanded, exeDir) || null;
}

function iconNode(item: ToolItem): HTMLElement {
  const path = iconFilePath(item.icon);
  if (path) {
    const url = imageIconUrl(path);
    if (url) {
      const img = E('img', 'mn-item-img');
      img.src = url;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      return img;
    }
    return I('image');
  }
  return I(itemIcon(item));
}

function iconClass(item: ToolItem): string {
  if (item.type === 'FOLDER') return 'mn-item-icon folder';
  if (item.type === 'GUI' || item.type === 'URL') return 'mn-item-icon gui';
  return 'mn-item-icon';
}

function toggleFavorite(item: ToolItem): void {
  store.update((state) => {
    const index = state.favorites.indexOf(item.id);
    if (index >= 0) state.favorites.splice(index, 1);
    else state.favorites.push(item.id);
  });
}

/** 批量收藏：只补缺失的，不取消已有的。 */
function favoriteMany(ids: number[]): void {
  store.update((state) => {
    for (const id of ids) if (!state.favorites.includes(id)) state.favorites.push(id);
  });
  toast(`已收藏 ${ids.length} 个项目`);
}

function toggleSelection(item: ToolItem): void {
  if (ui.selection.has(item.id)) ui.selection.delete(item.id);
  else ui.selection.add(item.id);
  renderAll();
}

function confirmDelete(ids: number[]): void {
  void openPanel('confirm', {
    title: ids.length > 1 ? `删除 ${ids.length} 个项目` : '删除项目',
    message: '配置会立即从本机数据中移除，此操作不可撤销。',
    action: ids.length > 1 ? { kind: 'delete-items', ids } : { kind: 'delete-item', id: ids[0] },
  });
}

function itemMenu(item: ToolItem, event: MouseEvent): void {
  const entries: MenuItem[] = [
    { text: '启动', icon: 'play', fn: () => launchItem(item) },
    { text: '编辑', icon: 'pencil', hint: 'F2', fn: () => openPanel('editor', { item }) },
    { text: '设置密码', icon: 'lock', fn: () => openPanel('password', { name: item.name }) },
    { text: '打开方式', icon: 'external-link', fn: () => openPanel('openwith', { item }) },
    { text: '匹配范围', icon: 'scan', fn: () => openPanel('scope', { item }) },
    { text: '参数变量', icon: 'braces', fn: () => openPanel('variables') },
    null,
    { text: '收藏', icon: 'star', checked: store.state.favorites.includes(item.id), fn: () => toggleFavorite(item) },
    {
      text: '添加到批量选择',
      icon: 'check-square',
      fn: () => {
        ui.selection.add(item.id);
        renderAll();
      },
    },
    null,
    {
      text: '复制到',
      icon: 'copy',
      fn: () => openPanel('transfer', { mode: '复制', ids: [item.id] }),
    },
    {
      text: '移动到',
      icon: 'folder-input',
      fn: () => openPanel('transfer', { mode: '移动', ids: [item.id] }),
    },
    null,
    { text: '删除', icon: 'trash-2', danger: true, fn: () => confirmDelete([item.id]) },
  ];
  openMenu(entries, event);
}

function categoryMenu(name: string, event: MouseEvent): void {
  openMenu(
    [
      { text: '新建分类', icon: 'folder-plus', fn: () => openPanel('category', { mode: '新建' }) },
      { text: '重命名', icon: 'pencil', fn: () => openPanel('category', { mode: '重命名', name }) },
      { text: '设置密码', icon: 'lock', fn: () => openPanel('password', { name }) },
      ...(hasCategoryPassword(store.state, name)
        ? [
            {
              text: '解锁',
              icon: 'lock-open',
              fn: () => openPanel('password', { name, mode: 'unlock' }),
            },
            {
              text: '清除口令',
              icon: 'shield-off',
              fn: () => {
                store.update((draft) => {
                  delete draft.passwords[name];
                });
                lockCategory(name);
                toast(`已清除「${name}」的口令`);
              },
            },
          ]
        : []),
      {
        text: '清空分类',
        icon: 'eraser',
        danger: true,
        fn: () =>
          void openPanel('confirm', {
            title: '清空分类',
            message: `将移除「${name}」下的全部演示项目。`,
            action: { kind: 'clear-category', name },
          }),
      },
      {
        text: '删除分类',
        icon: 'trash-2',
        danger: true,
        fn: () =>
          void openPanel('confirm', {
            title: '删除分类',
            message: `将删除「${name}」分类，其中的项目一并移除。`,
            action: { kind: 'delete-category', name },
          }),
      },
    ],
    event,
  );
}

function batchBar(): void {
  const bar = batchbar();
  bar.replaceChildren();
  if (!ui.selection.size) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  bar.append(E('span', '', `已选 ${ui.selection.size} 项`));
  const ids = [...ui.selection];
  if (ids.length === 1) {
    const only = store.state.items.find((item) => item.id === ids[0]);
    bar.append(
      B('编辑', () => {
        if (only) openPanel('editor', { item: only });
      }),
    );
  }
  bar.append(
    B('改分类', () => void openPanel('batch', { ids, mode: '分类' })),
    B('改分组', () => void openPanel('batch', { ids, mode: '分组' })),
    B('收藏', () => favoriteMany(ids), 'mn-btn', 'star'),
    B('复制到', () => void openPanel('transfer', { mode: '复制', ids })),
    B('移动到', () => void openPanel('transfer', { mode: '移动', ids })),
    B('删除', () => confirmDelete(ids)),
    B('取消选择', () => {
      ui.selection.clear();
      renderAll();
    }),
  );
}

function breadcrumbBar(): void {
  const bar = breadcrumb();
  bar.replaceChildren();
  if (!ui.folderStack.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const root = B(store.state.category, () => {
    ui.folderStack = [];
    renderAll();
  });
  root.prepend(I('chevron-left'));
  bar.append(root);
  for (const folder of ui.folderStack) bar.append(E('span', '', `/ ${folder.name}`));
}

function renderCategories(): void {
  const nav = categoryNav();
  nav.replaceChildren();
  const align = String(store.state.values['分类名对齐方式'] ?? '居中');
  nav.style.textAlign = align === '居左' ? 'left' : align === '居右' ? 'right' : 'center';
  for (const name of store.state.categories) {
    const button = E('button', 'mn-category', name);
    if (name === store.state.category) button.setAttribute('aria-current', 'page');
    if (hasCategoryPassword(store.state, name)) {
      const badge = E('span', 'mn-lock');
      badge.append(I('lock'));
      button.append(badge);
    }
    button.addEventListener('click', () => {
      if (consumeReorderClick()) return;
      if (isCategoryLocked(store.state, name)) {
        void openPanel('password', { name, mode: 'unlock' });
        return;
      }
      store.update((state) => {
        state.category = name;
      });
      ui.folderStack = [];
      ui.selection.clear();
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      categoryMenu(name, event);
    });
    nav.append(button);
  }
}

function renderItems(): void {
  const body = itemBody();
  body.replaceChildren();
  if (ui.searching) {
    renderSearchResults(body);
    return;
  }
  const groups = new Map<string, ToolItem[]>();
  for (const item of visibleItems()) {
    const key = item.group || '未分组';
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  if (!groups.size) {
    body.append(E('p', 'mn-note', '这个分类还没有项目，右键或点击加号添加。'));
    return;
  }
  for (const [title, items] of groups) {
    const group = E('section', 'mn-group');
    group.append(E('h3', 'mn-group-title', title));
    const grid = E('div', 'mn-itemgrid');
    for (const item of items) grid.append(renderItem(item));
    group.append(grid);
    body.append(group);
  }
}

function renderItem(item: ToolItem): HTMLElement {
  if (item.type === 'SPACER') return E('div', 'mn-spacer');
  const row = E('div', 'mn-item');
  row.dataset.itemId = String(item.id);
  row.dataset.group = item.group ?? '';
  if (ui.selection.has(item.id)) row.classList.add('selected');
  if (ui.selection.size) {
    const check = E('input', 'mn-batchcheck') as HTMLInputElement;
    check.type = 'checkbox';
    check.checked = ui.selection.has(item.id);
    check.setAttribute('aria-label', `选择 ${item.name}`);
    check.addEventListener('change', () => toggleSelection(item));
    row.append(check);
  }
  const launch = E('button', 'mn-launch');
  const glyph = E('span', iconClass(item));
  glyph.append(iconNode(item));
  const name = E('span', 'mn-name', item.name);
  if (item.type === 'TITLE') {
    launch.append(glyph, name);
    launch.addEventListener('click', () => toast('标题项目没有动作'));
    row.append(launch);
    return row;
  }
  launch.append(glyph, name);
  launch.title = item.target;
  const doubleClickLaunch = store.state.values['双击运行项目'] === true;
  launch.addEventListener('click', (event) => {
    // 拖动排序松手时浏览器还会补一次 click，别让它顺手启动项目。
    if (consumeReorderClick()) return;
    if (event.ctrlKey || event.metaKey) {
      toggleSelection(item);
      return;
    }
    if (ui.selection.size) {
      toggleSelection(item);
      return;
    }
    // 开启“双击运行”时，单击只聚焦，避免鼠标误触就启动程序。
    if (doubleClickLaunch) return;
    launchItem(item);
  });
  if (doubleClickLaunch) {
    launch.addEventListener('dblclick', () => launchItem(item));
  }
  const fav = B('', () => toggleFavorite(item), 'mn-favorite', 'star');
  fav.setAttribute('aria-pressed', String(store.state.favorites.includes(item.id)));
  fav.setAttribute('aria-label', store.state.favorites.includes(item.id) ? '取消收藏' : '收藏');
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    itemMenu(item, event);
  });
  row.append(launch, fav);
  return row;
}

function pluginEnabled(name: string): boolean {
  const value = store.state.values[`plugin.${name}`];
  return value !== false;
}

function renderSearchResults(body: HTMLElement): void {
  const query = ui.query.trim();
  if (!query) {
    for (const [name, keyword, label] of PLUGIN_KEYWORDS) {
      if (!pluginEnabled(name)) continue;
      const row = E('button', 'mn-searchrow');
      const glyph = E('span', 'mn-item-icon');
      glyph.append(I(name === 'Hash' ? 'hash' : name === 'Rand' ? 'shuffle' : name === 'Calc' ? 'calculator' : 'square-terminal'));
      const text = E('div', 'mn-resulttext');
      text.append(E('span', 'mn-name', name), E('div', 'mn-searchdesc', PLUGIN_DESCRIPTIONS[name] ?? label));
      row.append(glyph, text, E('kbd', '', keyword));
      row.addEventListener('click', () => void openPanel('plugin', { name }));
      body.append(row);
    }
    return;
  }
  const locked = new Set(
    store.state.categories.filter((category) => isCategoryLocked(store.state, category)),
  );
  const useRegex = store.state.values['正则表达式'] === true;
  let matcher: (text: string) => boolean;
  if (useRegex) {
    let pattern: RegExp | null = null;
    try {
      pattern = new RegExp(query, 'i');
    } catch {
      pattern = null;
    }
    matcher = pattern ? (text) => pattern.test(text) : (text) => text.toLowerCase().includes(query.toLowerCase());
  } else {
    const needle = query.toLowerCase();
    matcher = (text) => text.toLowerCase().includes(needle);
  }
  const needle = query.toLowerCase();
  const usePinyin = store.state.values['拼音'] === true;
  const useInitials = store.state.values['拼音首字母'] === true;
  const matches = store.state.items.filter(
    (item) =>
      !locked.has(item.category) &&
      [item.name, item.group, item.category, item.keywords].some((field) => {
        const text = String(field ?? '');
        if (matcher(text)) return true;
        if (useRegex || (!usePinyin && !useInitials) || !text) return false;
        const [full, initials] = pinyinKeys(text);
        return (usePinyin && Boolean(full?.includes(needle))) || (useInitials && Boolean(initials?.startsWith(needle)));
      }),
  );
  if (!matches.length) {
    body.append(E('p', 'mn-note', `没有匹配「${query}」的项目。`));
    return;
  }
  matches.slice(0, 12).forEach((item, index) => {
    const row = E('button', 'mn-searchrow');
    if (index === ui.activeResult) row.classList.add('active');
    const glyph = E('span', iconClass(item));
    glyph.append(iconNode(item));
    const text = E('div', 'mn-resulttext');
    text.append(E('span', 'mn-name', item.name));
    const desc = [item.category, item.group].filter(Boolean).join(' · ');
    text.append(E('div', 'mn-searchdesc', desc || item.target));
    row.append(glyph, text, E('kbd', '', `Alt ${index + 1}`));
    row.addEventListener('click', () => {
      if (item.type === 'FOLDER') {
        store.update((state) => {
          state.category = item.category;
        });
        ui.searching = false;
        ui.folderStack = [item];
        ui.query = '';
        renderAll();
        return;
      }
      launchItem(item);
    });
    body.append(row);
  });
  ui.activeResult = Math.min(ui.activeResult, matches.length - 1);
}

function renderFooter(): void {
  footerLeft().textContent = `${visibleItems().length} 个项目 · 右键管理`;
  footerHint().textContent = isDesktop() ? '配置自动保存 · 托盘常驻' : '浏览器预览 · 不启动程序';
}

function renderChrome(): void {
  const instance = app();
  instance.classList.toggle('searching', ui.searching);
  for (const name of ['view-icons', 'view-tiles']) instance.classList.remove(name);
  const view = viewModeOf(store.state);
  if (view !== 'list') instance.classList.add(view === 'icons' ? 'view-icons' : 'view-tiles');
  for (const name of CATEGORY_CLASSES) instance.classList.remove(name);
  const placement = categoryPlacementOf(store.state);
  if (placement !== 'left') instance.classList.add(`cats-${placement}`);
  instance.style.setProperty('--mn-iconsize', iconSizeOf(store.state));
  searchbar().hidden = !ui.searching;
  const pin = must<HTMLElement>('[data-act="pin"]');
  pin.setAttribute('aria-pressed', String(ui.pinned));
  const brand = document.querySelector('.mn-brand');
  if (brand) brand.textContent = String(store.state.values['窗口标题'] ?? '工具箱');
}

function renderAll(): void {
  applyAppearance(store.state);
  renderChrome();
  renderCategories();
  breadcrumbBar();
  batchBar();
  renderItems();
  renderFooter();
  icons();
}

function updateSearch(): void {
  ui.query = searchInput().value;
  ui.activeResult = 0;
  renderItems();
  icons();
}

function openSettings(page: string): void {
  void openPanel('settings', { page });
}

/** 程序触发的点击事件坐标为 0，这里按按钮位置给菜单一个锚点。 */
function anchorEvent(trigger: HTMLElement | null): MouseEvent {
  if (!trigger) return new MouseEvent('click', { clientX: 8, clientY: 40 });
  const rect = trigger.getBoundingClientRect();
  return new MouseEvent('click', { clientX: rect.left, clientY: rect.bottom + 2 });
}

function setPlacement(label: string): void {
  store.update((state) => {
    state.values['分类显示位置'] = label;
  });
}

function setIconSize(label: string): void {
  store.update((state) => {
    state.values['项目图标尺寸'] = label;
  });
}

function sortByIdentity(mode: 'name' | 'group'): void {
  store.update((state) => {
    state.values['项目排序方式'] = mode === 'name' ? '按名称' : '按分组';
    const current = state.items.filter(
      (item) => item.category === state.category && item.parent === currentParent(),
    );
    const ids = new Set(current.map((item) => item.id));
    const sorted = [...current].sort((a, b) =>
      mode === 'name'
        ? a.name.localeCompare(b.name, 'zh-Hans-CN')
        : a.group.localeCompare(b.group, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'),
    );
    const rest = state.items.filter((item) => !ids.has(item.id));
    state.items = [...rest, ...sorted];
  });
}

function selectAllVisible(): void {
  for (const item of visibleItems()) ui.selection.add(item.id);
  renderAll();
}

function mainMenu(event: MouseEvent): void {
  openMenu(
    [
      {
        text: '新建',
        icon: 'plus',
        children: [
          { text: '新建项目', icon: 'file-plus', fn: () => void openPanel('editor', {}) },
          { text: '新建分类', icon: 'folder-plus', fn: () => void openPanel('category', { mode: '新建' }) },
          { text: '添加内置项目', icon: 'library', fn: () => void openPanel('builtin') },
          { text: '从文件批量添加', icon: 'files', fn: () => void openPanel('drop', { names: [] }) },
          { text: '导入数据', icon: 'upload', fn: () => void openPanel('import') },
        ],
      },
      {
        text: '视图',
        icon: 'layout-grid',
        children: [
          { text: '列表', checked: store.state.view === 'list', fn: () => setView('list') },
          { text: '图标', checked: store.state.view === 'icons', fn: () => setView('icons') },
          { text: '平铺', checked: store.state.view === 'tiles', fn: () => setView('tiles') },
          null,
          { text: '分类在左侧', checked: categoryPlacementOf(store.state) === 'left', fn: () => setPlacement('左侧') },
          { text: '分类在右侧', checked: categoryPlacementOf(store.state) === 'right', fn: () => setPlacement('右侧') },
          { text: '分类在顶部', checked: categoryPlacementOf(store.state) === 'top', fn: () => setPlacement('顶部') },
          { text: '分类在底部', checked: categoryPlacementOf(store.state) === 'bottom', fn: () => setPlacement('底部') },
          { text: '隐藏分类', checked: categoryPlacementOf(store.state) === 'none', fn: () => setPlacement('隐藏') },
          null,
          { text: '小图标', checked: String(store.state.values['项目图标尺寸']) === '小图标', fn: () => setIconSize('小图标') },
          { text: '中图标', checked: String(store.state.values['项目图标尺寸']) === '中图标', fn: () => setIconSize('中图标') },
          { text: '大图标', checked: String(store.state.values['项目图标尺寸']) === '大图标', fn: () => setIconSize('大图标') },
        ],
      },
      {
        text: '排序方式',
        icon: 'arrow-down-wide-narrow',
        children: [
          { text: '自定义顺序', icon: 'grip-vertical', checked: store.state.values['项目排序方式'] === '自定义顺序', fn: () => toast('当前按拖动后的顺序排列') },
          { text: '按名称', icon: 'arrow-down-a-z', fn: () => sortByIdentity('name') },
          { text: '按分组', icon: 'folder-tree', fn: () => sortByIdentity('group') },
        ],
      },
      {
        text: '批量操作',
        icon: 'check-square',
        children: [
          { text: '全选当前分类', icon: 'list-checks', fn: () => selectAllVisible() },
          { text: '取消选择', icon: 'x', fn: () => { ui.selection.clear(); renderAll(); } },
          { text: '批量改分类', icon: 'folder-symlink', fn: () => void openPanel('batch', { ids: [...ui.selection], mode: '分类' }) },
          { text: '批量改分组', icon: 'folder-tree', fn: () => void openPanel('batch', { ids: [...ui.selection], mode: '分组' }) },
          { text: '批量收藏', icon: 'star', fn: () => favoriteMany([...ui.selection]) },
          { text: '复制到', icon: 'copy', fn: () => void openPanel('transfer', { mode: '复制', ids: [...ui.selection] }) },
          { text: '移动到', icon: 'folder-input', fn: () => void openPanel('transfer', { mode: '移动', ids: [...ui.selection] }) },
          { text: '删除选中', icon: 'trash-2', danger: true, fn: () => confirmDelete([...ui.selection]) },
        ],
      },
      null,
      {
        text: '快速设置',
        icon: 'sliders-horizontal',
        children: [
          { text: ui.pinned ? '取消置顶' : '置于顶层', checked: ui.pinned, fn: () => { ui.pinned = !ui.pinned; void setAlwaysOnTop(ui.pinned); renderChrome(); } },
          { text: '快速设置面板', icon: 'sliders-horizontal', fn: () => void openPanel('quick') },
          { text: '搜索', icon: 'search', hint: 'Ctrl+K / Ctrl+F', fn: () => toggleSearch(true) },
          { text: '设置', icon: 'settings', hint: 'F4', fn: () => openSettings('常规') },
        ],
      },
      {
        text: '工具',
        icon: 'wrench',
        children: [
          { text: '数据与备份', icon: 'database', fn: () => void openPanel('data') },
          { text: '项目快捷键', icon: 'keyboard', fn: () => void openPanel('hotkeys') },
          { text: '主题', icon: 'palette', fn: () => void openPanel('theme') },
          { text: '计划任务', icon: 'calendar-clock', fn: () => void openPanel('schedule') },
          { text: '鼠标手势', icon: 'mouse-pointer', fn: () => void openPanel('gestures') },
          { text: '路径转换', icon: 'route', fn: () => void openPanel('path', { mode: '绝对路径' }) },
          { text: '脚本引擎', icon: 'scroll-text', fn: () => void openPanel('script') },
          { text: '插件管理', icon: 'package', fn: () => void openPanel('plugins') },
          { text: '进程管理器', icon: 'activity', fn: () => void openPanel('manager') },
          { text: '安装扩展', icon: 'puzzle', fn: () => void openPanel('installplugin') },
          { text: '界面参考', icon: 'book-open', fn: () => void openPanel('sources') },
          { text: '构建信息', icon: 'info', fn: () => void openPanel('build') },
        ],
      },
      { text: '设置', icon: 'settings', hint: 'F4', fn: () => openSettings('常规') },
      null,
      { text: '帮助', icon: 'circle-help', fn: () => openSettings('帮助') },
      { text: '检查更新', icon: 'refresh-cw', fn: () => void openPanel('update') },
      { text: '退出', icon: 'log-out', fn: () => void quitApp() },
    ],
    event,
  );
}

function newMenu(event: MouseEvent): void {
  openMenu(
    [
      { text: '新建项目', icon: 'file-plus', hint: 'F2', fn: () => void openPanel('editor', {}) },
      { text: '新建分类', icon: 'folder-plus', fn: () => void openPanel('category', { mode: '新建' }) },
      null,
      { text: '添加内置项目', icon: 'library', fn: () => void openPanel('builtin') },
      { text: '从文件批量添加', icon: 'files', fn: () => void openPanel('drop', { names: [] }) },
      { text: '导入数据', icon: 'upload', fn: () => void openPanel('import') },
      { text: '导出数据', icon: 'download', fn: () => void openPanel('export') },
    ],
    event,
  );
}

function toggleSearch(force?: boolean): void {
  ui.searching = force ?? !ui.searching;
  if (!ui.searching) ui.query = '';
  renderChrome();
  renderItems();
  if (ui.searching) {
    searchInput().value = '';
    searchInput().focus();
  }
  icons();
}

function bindKeys(): void {
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if (event.key === 'Escape') {
      const menu = document.querySelector<HTMLElement>('.mn-menu');
      if (menu && !menu.hidden) {
        menu.hidden = true;
        return;
      }
      if (ui.searching) {
        toggleSearch(false);
        return;
      }
      if (ui.selection.size) {
        ui.selection.clear();
        renderAll();
        return;
      }
      if (ui.folderStack.length) {
        ui.folderStack.pop();
        renderAll();
      }
      return;
    }
    if (event.altKey && /^[1-9]$/.test(event.key) && store.state.values['Alt + 数字键运行搜索结果'] !== false) {
      const rows = document.querySelectorAll<HTMLElement>('.mn-searchrow');
      const row = rows[Number(event.key) - 1];
      if (row) {
        event.preventDefault();
        row.click();
      }
      return;
    }
    if (ui.searching && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const rows = [...document.querySelectorAll<HTMLElement>('.mn-searchrow')];
      if (!rows.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      ui.activeResult = Math.min(Math.max(ui.activeResult + step, 0), rows.length - 1);
      rows.forEach((row, index) => row.classList.toggle('active', index === ui.activeResult));
      return;
    }
    if (ui.searching && event.key === 'Enter' && !typing) {
      const row =
        document.querySelector<HTMLElement>('.mn-searchrow.active') ??
        document.querySelector<HTMLElement>('.mn-searchrow');
      if (row) {
        event.preventDefault();
        row.click();
      }
      return;
    }
    // 功能键/组合键先于输入态处理：搜索框有焦点时 F4、F2、Ctrl+K 也应该生效。
    if (event.key === 'F4') {
      event.preventDefault();
      openSettings('常规');
      return;
    }
    if (event.key === 'F2') {
      const id = [...ui.selection][0];
      const item = id === undefined ? undefined : store.state.items.find((entry) => entry.id === id);
      if (item) {
        event.preventDefault();
        void openPanel('editor', { item });
      }
      return;
    }
    if (event.key === 'F10' && event.shiftKey) {
      event.preventDefault();
      const id = [...ui.selection][0];
      const item = id === undefined ? undefined : store.state.items.find((entry) => entry.id === id);
      if (item) itemMenu(item, new MouseEvent('contextmenu', { clientX: 120, clientY: 120 }));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && ['k', 'f'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      toggleSearch(true);
      return;
    }
    if (typing) {
      if (ui.searching && event.key === 'Enter') {
        const row = document.querySelector<HTMLElement>('.mn-searchrow.active') ?? document.querySelector<HTMLElement>('.mn-searchrow');
        row?.click();
      }
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      toggleSearch(true);
      searchInput().value = event.key;
      updateSearch();
    }
  });
}

function bindChrome(): void {
  must<HTMLElement>('[data-act="pin"]').addEventListener('click', () => {
    ui.pinned = !ui.pinned;
    store.update((state) => {
      state.values['置于顶层'] = ui.pinned;
    });
    void setAlwaysOnTop(ui.pinned);
    renderChrome();
    toast(ui.pinned ? '已置于顶层' : '已取消置顶');
  });
  must<HTMLElement>('[data-act="search"]').addEventListener('click', () => toggleSearch());
  must<HTMLElement>('[data-act="searchclose"]').addEventListener('click', () => toggleSearch(false));
  must<HTMLElement>('[data-act="mainmenu"]').addEventListener('click', (event) =>
    mainMenu(anchorEvent(event.currentTarget as HTMLElement)),
  );
  must<HTMLElement>('[data-act="newmenu"]').addEventListener('click', (event) =>
    newMenu(anchorEvent(event.currentTarget as HTMLElement)),
  );
  must<HTMLElement>('[data-act="minimize"]').addEventListener('click', () => void minimizeMainWindow());
  must<HTMLElement>('[data-act="hide"]').addEventListener('click', () => {
    if (store.state.values['关闭按钮执行动作'] === '退出') {
      void quitApp();
      return;
    }
    void hideMainWindow();
    toast('已隐藏到托盘，点击托盘图标恢复');
  });
  searchInput().addEventListener('input', () => updateSearch());
  searchInput().addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const rows = [...document.querySelectorAll<HTMLElement>('.mn-searchrow')];
      if (!rows.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      ui.activeResult = Math.min(Math.max(ui.activeResult + step, 0), rows.length - 1);
      rows.forEach((row, index) => row.classList.toggle('active', index === ui.activeResult));
    }
  });
  must<HTMLElement>('.mn-items').addEventListener('contextmenu', (event) => {
    const row = (event.target as HTMLElement).closest('.mn-item');
    if (row) return;
    event.preventDefault();
    openMenu(
      [
        { text: '新建项目', icon: 'file-plus', fn: () => void openPanel('editor', {}) },
        { text: '新建分类', icon: 'folder-plus', fn: () => void openPanel('category', { mode: '新建' }) },
        { text: '视图：列表', icon: 'list', fn: () => setView('list') },
        { text: '视图：图标', icon: 'grid', fn: () => setView('icons') },
        { text: '视图：平铺', icon: 'layout-grid', fn: () => setView('tiles') },
      ],
      event,
    );
  });
}

function setView(view: 'list' | 'icons' | 'tiles'): void {
  store.update((state) => {
    state.view = view;
  });
}

function bindDrop(): void {
  const stage = must<HTMLElement>('.mn-stage');
  let depth = 0;
  stage.addEventListener('dragenter', (event) => {
    event.preventDefault();
    depth += 1;
    stage.classList.add('dragging');
  });
  stage.addEventListener('dragover', (event) => event.preventDefault());
  stage.addEventListener('dragleave', () => {
    depth -= 1;
    if (depth <= 0) {
      depth = 0;
      stage.classList.remove('dragging');
    }
  });
  stage.addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    stage.classList.remove('dragging');
    const names = Array.from(event.dataTransfer?.files ?? []).map((file) => file.name);
    void openPanel('drop', { names });
  });
}

export function mountMainWindow(): Promise<void> {
  bindChrome();
  bindKeys();
  bindDrop();
  bindReorder(itemBody(), categoryNav());

  store.subscribe(() => {
    syncPinned();
    applyAppearance(store.state);
    renderAll();
    applyTitle();
    primeImageIcons(store.state.items.map((item) => iconFilePath(item.icon)));
    void syncHotkeys();
    void syncAutostart();
  });

  onImageIconsLoaded(renderAll);
  primeImageIcons(store.state.items.map((item) => iconFilePath(item.icon)));

  return initDesktop();
}

let hotkeySignature = '';
let titleApplied = '';
let pinnedApplied: boolean | null = null;

/** 置顶可能由设置面板修改，主窗口要跟着落到真实窗口上。 */
function syncPinned(): void {
  const next = store.state.values['置于顶层'] === true;
  if (next === pinnedApplied) return;
  pinnedApplied = next;
  ui.pinned = next;
  void setAlwaysOnTop(next);
  renderChrome();
}

function applyTitle(): void {
  const title = String(store.state.values['窗口标题'] ?? '工具箱');
  if (title === titleApplied) return;
  titleApplied = title;
  void setWindowTitle(title);
  document.title = title;
}

async function syncHotkeys(): Promise<void> {
  if (!isDesktop()) return;
  const mainKey = String(store.state.values['全局快捷键'] ?? 'Alt + Space');
  const searchKey = String(store.state.values['搜索快捷键'] ?? 'Ctrl + Alt + Space');
  const items = store.state.items
    .filter((item) => item.hotkey && item.hotkey.trim())
    .map((item) => ({
      label: `项目「${item.name}」`,
      key: (item.hotkey ?? '').trim(),
      handler: () => launchItem(item),
    }));
  const signature = [mainKey, searchKey, ...items.map((entry) => entry.key)].join('|');
  if (signature === hotkeySignature) return;
  hotkeySignature = signature;
  const failures = await applyGlobalHotkeys(mainKey, searchKey, {
    main: () => void toggleMainWindowVisibility(),
    search: () => {
      void toggleMainWindowVisibility().then(() => toggleSearch(true));
    },
    items,
  });
  if (failures.length) toast(failures.join('；'));
}

async function syncAutostart(): Promise<void> {
  if (!isDesktop()) return;
  const wanted = store.state.values['开机启动'] === true;
  try {
    if ((await autostartEnabled()) !== wanted) await setAutostart(wanted);
  } catch {
    // 开机自启失败不阻断其它功能，设置页仍可重试。
  }
}

async function initDesktop(): Promise<void> {
  const paths = await appPaths();
  if (paths) exeDir = paths.exeDir;
  ui.pinned = store.state.values['置于顶层'] === true;
  await applyMainWindowSize(store.state.windowSize);
  // 监听要在“应用位置”之前注册：位置落在屏幕外时会改成居中，这个新位置也要能存下来。
  await watchMainWindowMove((position) => {
    store.update((state) => {
      state.windowPosition = position;
    });
  });
  await applyMainWindowPosition(store.state.windowPosition);
  await setAlwaysOnTop(ui.pinned);
  await syncMaximizedClass();
  await watchMainWindowSize((size) => {
    store.update((state) => {
      state.windowSize = size;
    });
  });
  await syncHotkeys();
  await syncAutostart();
  await listenTrayActions({ settings: () => openSettings('常规') });
  await listenFileDrop((paths) => {
    void openPanel('drop', { paths });
  });
  startPersistence();
  applyTitle();
  renderAll();
}
