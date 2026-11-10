import { themeColorRows, themeGroups } from '../../data/lang';
import { store } from '../../state/store';
import {
  importConfigFile,
  isDesktop,
  listThemeFiles,
  pickOpenPath,
  readThemeFile,
  writeThemeFile,
} from '../../services/desktop';
import { B, E, icons, toast } from '../dom';
import { field, table } from '../fields';
import { panelFrame, type PanelContext } from './context';

let themeGroup = '全局';

function pickDefaultColor(name: string, accent: string): string {
  if (name.includes('背景')) return '#ffffff';
  if (name.includes('边框')) return '#e3e8f2';
  if (name.includes('文字')) return '#65748e';
  return accent;
}

function applyVar(group: string, name: string, value: string): void {
  const root = document.getElementById('nano-interface');
  if (!root) return;
  if (group === '全局' && name === '文字') root.style.setProperty('--mn-text', value);
  if (group === '窗口' && name === '背景') root.style.setProperty('--mn-background', value);
}

const THEME_KIND = 'qibox-theme';

function currentThemeName(): string {
  const name = String(store.state.values['主题'] ?? '自定义主题');
  return name.replace(/[\/:*?"<>|]/g, '-').trim() || '自定义主题';
}

export function themeJson(): string {
  const state = store.state;
  const colors: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.values)) {
    if (key.startsWith('theme-') && typeof value === 'string') colors[key] = value;
  }
  return JSON.stringify(
    {
      schema: 1,
      kind: THEME_KIND,
      name: currentThemeName(),
      accent: state.accent,
      radius: state.radius,
      tint: state.tint,
      background: String(state.values['背景图片'] ?? ''),
      colors,
      savedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function applyThemeJson(text: string): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    toast('主题文件不是合法 JSON');
    return false;
  }
  if (typeof payload !== 'object' || payload === null) {
    toast('主题文件内容为空');
    return false;
  }
  const theme = payload as {
    kind?: string;
    accent?: string;
    radius?: number;
    background?: string;
    colors?: Record<string, string>;
  };
  if (theme.kind !== THEME_KIND) {
    toast('不是 QiBox 主题文件');
    return false;
  }
  store.update((draft) => {
    if (typeof theme.accent === 'string') draft.accent = theme.accent;
    if (typeof theme.radius === 'number') draft.radius = theme.radius;
    if (typeof theme.background === 'string') draft.values['背景图片'] = theme.background;
    for (const [key, value] of Object.entries(theme.colors ?? {})) {
      if (key.startsWith('theme-') && typeof value === 'string') draft.values[key] = value;
    }
  });
  toast('主题已应用');
  return true;
}

async function saveCurrentTheme(): Promise<void> {
  if (!isDesktop()) {
    toast('浏览器预览不能写主题文件');
    return;
  }
  try {
    const path = await writeThemeFile(`${currentThemeName()}.json`, themeJson());
    toast(`主题已保存：${path}`);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function importThemeFile(): Promise<void> {
  if (!isDesktop()) {
    toast('浏览器预览不能读取主题文件');
    return;
  }
  try {
    const path = await pickOpenPath();
    if (!path) return;
    applyThemeJson(await importConfigFile(path));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function applySavedTheme(name: string): Promise<void> {
  try {
    applyThemeJson(await readThemeFile(name));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

export const themePanel = {
  title: '主题编辑器',
  size: 'large' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('主题编辑器');
    body.classList.add('flush');

    const toolbar = E('div', 'mn-toolbar');
    toolbar.append(
      B('重新加载', () => ctx.refresh(), 'mn-btn', 'refresh-cw'),
      B('保存', () => void saveCurrentTheme().then(() => ctx.refresh()), 'mn-btn', 'save'),
      B('导入主题', () => void importThemeFile(), 'mn-btn', 'folder-open'),
      B('另存为', () => ctx.open('themesave'), 'mn-btn', 'copy'),
      E('span', 'mn-note', String(store.state.values['主题'] ?? '自定义主题')),
    );
    body.append(toolbar);

    if (isDesktop()) {
      void listThemeFiles().then((files) => {
        if (!files.length) return;
        const row = E('div', 'mn-toolbar');
        row.append(E('span', 'mn-note', '本机主题'));
        for (const file of files.slice(0, 6)) {
          row.append(B(file.replace(/\.json$/, ''), () => void applySavedTheme(file), 'mn-btn', 'palette'));
        }
        body.append(row);
      });
    }

    const layout = E('div', 'mn-theme-layout');
    const nav = E('nav', 'mn-theme-nav');
    const content = E('div', 'mn-theme-body');

    for (const group of themeGroups()) {
      nav.append(
        B(
          group,
          () => {
            themeGroup = group;
            ctx.refresh();
          },
          themeGroup === group ? 'active' : '',
        ),
      );
    }

    const accent = store.state.accent;
    const rows = themeColorRows().map(([key, name]) => {
      const color = E('input');
      color.type = 'color';
      color.value =
        String(store.state.values[`theme-${themeGroup}-${key}`] ?? '') || pickDefaultColor(name, accent);
      color.setAttribute('aria-label', `${themeGroup} ${name}颜色`);
      color.addEventListener('input', () => {
        store.setValue(`theme-${themeGroup}-${key}`, color.value);
        applyVar(themeGroup, name, color.value);
      });
      const controls = E('span', 'mn-inline');
      controls.append(
        B('复制', () => toast(`已复制颜色 ${color.value}（演示）`)),
        B('粘贴', () => toast('演示界面：未粘贴颜色')),
      );
      const rgb = [1, 3, 5]
        .map((offset) => parseInt(color.value.slice(offset, offset + 2), 16))
        .join(' / ');
      return [name, color, `${rgb} / 255`, controls];
    });

    content.append(table(['属性', '颜色', 'R / G / B / A', '操作'], rows));
    layout.append(nav, content);
    body.append(layout);

    footer?.append(
      B('恢复默认', () => {
        const root = document.getElementById('nano-interface');
        root?.style.setProperty('--mn-background', '#fff');
        root?.style.setProperty('--mn-text', '#414855');
        store.update((draft) => {
          for (const key of Object.keys(draft.values)) {
            if (key.startsWith('theme-')) delete draft.values[key];
          }
        });
        ctx.refresh();
        toast('已恢复默认主题');
      }),
      B('关闭', () => ctx.close(), 'mn-btn primary'),
    );
    icons();
  },
};

export const themeSavePanel = {
  title: '主题另存为',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('主题另存为', 'small');
    let name = currentThemeName();
    const file = field('文件名', 'text', `${name}.json`);
    const nameField = field('主题名称', 'text', name, undefined, (value) => {
      name = String(value);
      if (file instanceof HTMLInputElement) file.value = `${currentThemeName()}.json`;
    });
    const input = file instanceof HTMLInputElement ? file : null;
    if (input) input.readOnly = true;
    body.append(nameField, file, E('p', 'mn-note', '保存到 %AppData%\QiBox\themes。'));
    footer?.append(
      B('取消', () => ctx.close()),
      B(
        '保存',
        () => {
          if (!isDesktop()) {
            toast('浏览器预览不能写主题文件');
            return;
          }
          void writeThemeFile(`${name}.json`, themeJson())
            .then((path) => {
              ctx.close();
              toast(`主题已保存：${path}`);
            })
            .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
        },
        'mn-btn primary',
      ),
    );
    icons();
  },
};
