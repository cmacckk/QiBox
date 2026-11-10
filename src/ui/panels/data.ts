import { isDesktop, listBackups, openDataDir, pickSavePath, exportConfigFile, pickOpenPath, importConfigFile, readBackup } from '../../services/desktop';
import { flushSave } from '../../state/persistence';
import { store } from '../../state/store';
import type { AppState } from '../../domain/types';
import { B, E, icons, toast } from '../dom';
import { check, field } from '../fields';
import {
  normalizeImportedItem,
  parseMayeDatabase,
  summarize,
  type MayeImportResult,
} from '../../services/maye-import';
import { panelFrame, type PanelContext } from './context';

function payloadOf(includeSettings: boolean, includeTheme: boolean): string {
  const state = store.state;
  const payload: Partial<AppState> = {
    schema: state.schema,
    categories: state.categories,
    items: state.items,
    favorites: state.favorites,
    tasks: state.tasks,
  };
  if (includeSettings) payload.values = state.values;
  if (includeTheme) {
    payload.accent = state.accent;
    payload.radius = state.radius;
    payload.view = state.view;
  }
  return JSON.stringify(payload, null, 2);
}

function parsePayload(raw: string): Partial<AppState> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('文件不是合法 JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('文件内容不是有效配置');
  const candidate = parsed as Partial<AppState>;
  if (!Array.isArray(candidate.items)) throw new Error('配置里没有项目列表，无法导入');
  return candidate;
}

function applyPayload(candidate: Partial<AppState>, replace: boolean): number {
  const imported = candidate.items ?? [];
  store.update((state) => {
    if (replace) {
      state.categories = candidate.categories ?? state.categories;
      state.items = imported;
      state.favorites = candidate.favorites ?? [];
      if (candidate.tasks) state.tasks = candidate.tasks;
      if (candidate.values) state.values = { ...state.values, ...candidate.values };
      if (candidate.accent) state.accent = candidate.accent;
      if (typeof candidate.radius === 'number') state.radius = candidate.radius;
      if (candidate.view) state.view = candidate.view;
      return;
    }
    for (const category of candidate.categories ?? []) {
      if (!state.categories.includes(category)) state.categories.push(category);
    }
    const seen = new Set(state.items.map((item) => `${item.name}|${item.target}`));
    for (const item of imported) {
      const key = `${item.name}|${item.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      state.items.push({ ...item, id: nextId(state.items) });
    }
    if (candidate.values) state.values = { ...state.values, ...candidate.values };
  });
  return imported.length;
}

function nextId(items: Array<{ id: number }>): number {
  return Math.max(0, ...items.map((item) => item.id)) + 1;
}

function backupLabel(name: string): string {
  const match = /config-(\d+)\.json/.exec(name);
  if (!match) return name;
  const day = Number(match[1]);
  const date = new Date(day * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function renderBackups(host: HTMLElement, ctx: PanelContext): Promise<void> {
  host.replaceChildren();
  if (!isDesktop()) {
    host.append(E('p', 'mn-note', '浏览器预览不读写磁盘；桌面端会在 %AppData%\\QiBox\\backups 下每天留一份备份。'));
    return;
  }
  const names = await listBackups();
  if (!names.length) {
    host.append(E('p', 'mn-note', '还没有备份。修改配置后会自动生成当天备份。'));
    return;
  }
  const list = E('div', 'mn-list');
  for (const name of names) {
    const row = E('div', 'mn-row');
    row.append(E('span', 'mn-rowlabel', backupLabel(name)));
    row.append(
      B('恢复', () => {
        void (async () => {
          try {
            const raw = await readBackup(name);
            const count = applyPayload(parsePayload(raw), true);
            toast(`已从 ${backupLabel(name)} 恢复 ${count} 个项目`);
            ctx.refresh();
          } catch (error) {
            toast(error instanceof Error ? error.message : String(error));
          }
        })();
      }, 'mn-btn'),
      B('查看', () => void openBackupPreview(name), 'mn-btn'),
    );
    list.append(row);
  }
  host.append(list);
}

async function openBackupPreview(name: string): Promise<void> {
  try {
    const raw = await readBackup(name);
    toast(raw.slice(0, 160));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

export const dataPanel = {
  title: '数据管理',
  size: 'large' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('数据管理');

    const toolbar = E('div', 'mn-inline');
    toolbar.append(
      B('立即备份', () => {
        flushSave();
        toast('已写入配置并生成当天备份');
        ctx.refresh();
      }, 'mn-btn', 'archive'),
      B('打开数据目录', () => void openDataDir(), 'mn-btn', 'folder-open'),
      B('导入', () => ctx.open('import'), 'mn-btn', 'upload'),
      B('导出', () => ctx.open('export'), 'mn-btn', 'download'),
    );

    const backupsHost = E('div');
    body.append(
      toolbar,
      E('div', 'mn-divider'),
      E('h3', 'mn-subtitle', '自动备份'),
      backupsHost,
      E('div', 'mn-divider'),
      field('自动备份数量', 'number', Number(store.state.values['自动备份'] ?? 10), [], (value) => {
        store.setValue('自动备份', Number(value));
      }),
      B('从 Maye / Maye Lite 迁移', () => ctx.open('migrate'), 'mn-btn', 'folder-input'),
    );
    void renderBackups(backupsHost, ctx);
    footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};

export const importPanel = {
  title: '导入数据',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('导入数据', 'small');
    let mode: '合并' | '替换' = '合并';
    let filePath = '';

    body.append(
      field('数据文件', 'text', '未选择', [], () => {}),
      field('导入方式', 'select', '合并', ['合并', '替换'], (value) => {
        mode = value === '替换' ? '替换' : '合并';
      }),
      check('保留已有项目', true, () => {}),
      E('p', 'mn-note', '合并会跳过同名同路径的项目；替换会清空当前项目列表。'),
    );

    footer?.append(
      B('取消', () => ctx.close()),
      B('选择文件', () => {
        void (async () => {
          const picked = await pickOpenPath();
          if (!picked) {
            toast('浏览器预览不支持选择文件，请用桌面端');
            return;
          }
          filePath = picked;
          toast(`已选择 ${picked.split(/[\\/]/).pop() ?? picked}`);
        })();
      }, 'mn-btn', 'folder-open'),
      B('导入', () => {
        void (async () => {
          if (!filePath) {
            toast('请先选择要导入的配置文件');
            return;
          }
          try {
            const raw = await importConfigFile(filePath);
            const count = applyPayload(parsePayload(raw), mode === '替换');
            ctx.close();
            toast(`已导入 ${count} 个项目`);
          } catch (error) {
            toast(error instanceof Error ? error.message : String(error));
          }
        })();
      }, 'mn-btn primary'),
    );
    icons();
  },
};

export const exportPanel = {
  title: '导出数据',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('导出数据', 'small');
    let includeSettings = true;
    let includeTheme = false;
    let fileName = 'qibox-backup.json';

    body.append(
      check('项目与分类', true, () => {}),
      check('设置', includeSettings, (checked) => {
        includeSettings = checked;
      }),
      check('主题', includeTheme, (checked) => {
        includeTheme = checked;
      }),
      field('文件名', 'text', fileName, [], (value) => {
        const text = String(value).trim();
        if (text) fileName = text;
      }),
      E('p', 'mn-note', '导出为 JSON，可在另一台机器用「导入数据」还原。'),
    );

    footer?.append(
      B('取消', () => ctx.close()),
      B('导出', () => {
        void (async () => {
          const path = await pickSavePath(fileName);
          if (!path) {
            toast('浏览器预览不支持保存文件，请用桌面端');
            return;
          }
          try {
            await exportConfigFile(path, payloadOf(includeSettings, includeTheme));
            ctx.close();
            toast(`已导出到 ${path}`);
          } catch (error) {
            toast(error instanceof Error ? error.message : String(error));
          }
        })();
      }, 'mn-btn primary'),
    );
    icons();
  },
};

function siblingPath(path: string, name: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return index >= 0 ? `${path.slice(0, index + 1)}${name}` : name;
}

/** 合并/替换都走 store.update，一次写入、由持久化层统一落盘。 */
export function applyMaye(result: MayeImportResult, mode: 'merge' | 'replace'): number {
  let added = 0;
  store.update((draft) => {
    if (mode === 'replace') {
      draft.items = [];
      draft.categories = [];
      draft.favorites = [];
      draft.tasks = [];
    }
    for (const name of result.categories) {
      if (!draft.categories.includes(name)) draft.categories.push(name);
    }
    let nextId = draft.items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const seen = new Set(draft.items.map((item) => `${item.category}|${item.name}|${item.target}`));
    for (const raw of result.items) {
      const key = `${raw.category}|${raw.name}|${raw.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      draft.items.push({ ...normalizeImportedItem(raw), id: nextId });
      nextId += 1;
      added += 1;
    }
    for (const [label, value] of Object.entries(result.values)) {
      if (mode === 'replace' || draft.values[label] === undefined) draft.values[label] = value;
    }
    if (result.radius !== undefined && mode === 'replace') draft.radius = result.radius;
    if (result.categories[0] && (mode === 'replace' || !draft.categories.includes(draft.category))) {
      draft.category = result.categories[0];
    }
  });
  return added;
}

export const migratePanel = {
  title: '迁移数据',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('迁移 Maye / Maye Nano 数据', 'medium');
    let result: MayeImportResult | null = null;
    const status = E('p', 'mn-note', '选一个 MDB.json（同目录有 cfg.json 会自动一起读）。只读取旧版文件，不会写入或修改它。');
    const preview = E('div', 'mn-importpreview');
    const warnBox = E('div', 'mn-importwarn');
    const pick = B(
      '选择 MDB.json',
      () => {
        void (async () => {
          try {
            const path = await pickOpenPath();
            if (!path) {
              if (!isDesktop()) toast('浏览器预览不支持选择文件，请用桌面端');
              return;
            }
            const raw = await importConfigFile(path);
            let cfgText = '';
            try {
              cfgText = await importConfigFile(siblingPath(path, 'cfg.json'));
            } catch {
              cfgText = '';
            }
            result = parseMayeDatabase(raw, cfgText, siblingPath(path, '').replace(/[\/]$/, ''));
            status.textContent = `已读取 ${path.split(/[\\/]/).pop() ?? path}：${summarize(result)}。`;
            preview.replaceChildren();
            const sample = result.items.slice(0, 8);
            for (const item of sample) {
              preview.append(E('p', 'mn-note', `${item.category} / ${item.group || '未分组'} / ${item.name} · ${item.type}`));
            }
            if (result.items.length > sample.length) {
              preview.append(E('p', 'mn-note', `……其余 ${result.items.length - sample.length} 个项目也会一起导入`));
            }
            warnBox.replaceChildren();
            for (const warning of result.warnings) warnBox.append(E('p', 'mn-warn', warning));
            icons();
          } catch (error) {
            result = null;
            status.textContent = `读取失败：${error instanceof Error ? error.message : String(error)}`;
            preview.replaceChildren();
            warnBox.replaceChildren();
          }
        })();
      },
      'mn-btn',
      'file-json',
    );

    const pickRow = E('div', 'mn-inline');
    pickRow.append(pick);
    body.append(
      status,
      pickRow,
      E('p', 'mn-note', '合并：保留现有项目，跳过同名同目标的重复项。替换：清空当前项目与分类后整体导入（会先写一份当天备份）。'),
      preview,
      warnBox,
    );

    const run = (mode: 'merge' | 'replace'): void => {
      if (!result) {
        toast('先选一个 MDB.json');
        return;
      }
      const added = applyMaye(result, mode);
      toast(mode === 'replace' ? `已替换为 ${added} 个项目` : `已合并 ${added} 个新项目`);
      ctx.close();
    };

    footer?.append(
      B('关闭', () => ctx.close()),
      B('合并导入', () => run('merge'), 'mn-btn', 'plus'),
      B('替换导入', () => run('replace'), 'mn-btn primary', 'replace'),
    );
    icons();
  },
};

export const dataPreviewPanel = {
  title: '数据预览',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('数据预览', 'medium');
    const state = store.state;
    const payload = ctx.arg.config
      ? { theme: state.accent, radius: state.radius, view: state.view }
      : {
          categories: state.categories.slice(0, 3),
          items: state.items.slice(0, 3).map(({ name, type, category }) => ({ name, type, category })),
        };
    const pre = E('pre', 'mn-code');
    pre.textContent = JSON.stringify(payload, null, 2);
    body.append(pre);
    footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};
