/**
 * Maye / Maye Nano 数据库解析。
 *
 * 对外只做“读并转换”，不碰旧版文件：调用方传入 MDB.json 与可选的 cfg.json 文本，
 * 得到可以直接合并进 QiBox 分类 / 项目 / 设置 / 任务的结构。
 */
import type { ItemKind, SettingValue, TaskSample, ToolItem } from '../domain/types';

/** 分类里那条“分组标题”用的标志位；其余位含义未知，这里不猜。 */
const GROUP_FLAG = 67_108_864;

const SCRIPT_EXT = new Set(['bat', 'cmd', 'ps1', 'py', 'sh', 'js', 'mjs', 'vbs']);
const SHELL_HOSTS = new Set([
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'wt.exe',
  'conhost.exe',
  'bash.exe',
  'wsl.exe',
  'windowsterminal.exe',
]);

const VK_NAMES: Record<string, string> = {
  LCTRL: 'Ctrl',
  RCTRL: 'Ctrl',
  LSHIFT: 'Shift',
  RSHIFT: 'Shift',
  LALT: 'Alt',
  RALT: 'Alt',
  LWIN: 'Win',
  RWIN: 'Win',
  SPACE: 'Space',
  ENTER: 'Enter',
  ESC: 'Esc',
  TAB: 'Tab',
  UP: 'Up',
  DOWN: 'Down',
  LEFT: 'Left',
  RIGHT: 'Right',
};

interface MayeStats {
  categories: number;
  items: number;
  groups: number;
  /** 带分类口令的分类数；QiBox 暂不落库口令，只提示。 */
  passwords: number;
  tasks: number;
  skipped: number;
}

export interface MayeImportResult {
  categories: string[];
  items: ToolItem[];
  tasks: TaskSample[];
  values: Record<string, SettingValue>;
  radius?: number;
  accent?: string;
  stats: MayeStats;
  warnings: string[];
}

interface MayeCate {
  id: number;
  name: string;
  order: number;
  pwd?: string;
}

interface MayeItem {
  id: number;
  idCate: number;
  name: string;
  uri: string;
  param: string;
  dir: string;
  icon: string;
  kw: string;
  key: string;
  order: number;
  flags: number;
  remark: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** MDB 里 cate / item 既可能是 [[id, obj]] 也可能是 [obj]，两种都吃。 */
function unwrapEntries(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (Array.isArray(entry)) {
      const [, payload] = entry;
      const record = asRecord(payload);
      return Object.keys(record).length > 0 ? record : asRecord(entry[1]);
    }
    return asRecord(entry);
  });
}

function parseCategories(mdb: Record<string, unknown>): MayeCate[] {
  return unwrapEntries(mdb.cate)
    .map((record) => ({
      id: num(record.id),
      name: text(record.name),
      order: num(record.order),
      pwd: text(record.pwd),
    }))
    .filter((entry) => entry.name.length > 0)
    .sort((a, b) => a.order - b.order);
}

function parseItems(mdb: Record<string, unknown>): MayeItem[] {
  return unwrapEntries(mdb.item)
    .map((record) => ({
      id: num(record.id),
      idCate: num(record.idCate),
      name: text(record.name),
      uri: text(record.uri),
      param: text(record.param),
      dir: text(record.dir),
      icon: text(record.icon),
      kw: text(record.kw),
      key: text(record.key),
      order: num(record.order),
      flags: num(record.flags),
      remark: text(record.t),
    }))
    .filter((entry) => entry.name.length > 0)
    .sort((a, b) => a.order - b.order);
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return (normalized.split('/').pop() ?? '').toLowerCase();
}

function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

/** 按目标推断项目类型；推断不出来就交给 REGULAR，编辑器里还能改。 */
function typeForTarget(uri: string): ItemKind {
  const target = uri.trim();
  if (!target) return 'SPACER';
  if (/^[a-z]+:\/\//i.test(target) && !/^[a-z]:\\/i.test(target)) {
    if (/^(https?|ftp|file):\/\//i.test(target)) return 'URL';
  }
  const ext = extensionOf(target);
  if (ext === 'url') return 'URL';
  if (ext === 'lnk' || ext === 'appref-ms') return 'GUI';
  if (SCRIPT_EXT.has(ext)) return 'SCRIPT';
  if (ext === 'exe' || ext === 'com') {
    return SHELL_HOSTS.has(basename(target)) ? 'CLI' : 'GUI';
  }
  if (ext === '') {
    // 目录或裸命令：带路径分隔符的按文件夹，否则按命令行工具。
    return /[\\/]/.test(target) ? 'FOLDER' : 'CLI';
  }
  return 'REGULAR';
}

/** VK.LCTRL+VK.LSHIFT+VK.SPACE → Ctrl + Shift + Space；认不出的键直接丢掉。 */
function hotkeyFromVk(raw: string): string {
  if (!raw.trim()) return '';
  const parts = raw
    .split('+')
    .map((part) => part.trim().replace(/^VK\./i, '').toUpperCase())
    .filter(Boolean);
  const mapped: string[] = [];
  for (const part of parts) {
    if (VK_NAMES[part]) mapped.push(VK_NAMES[part]);
    else if (/^F\d{1,2}$/.test(part)) mapped.push(part);
    else if (/^[A-Z]$/.test(part)) mapped.push(part);
    else if (/^\d$/.test(part)) mapped.push(part);
  }
  return mapped.join(' + ');
}

function valuesFromCfg(cfg: Record<string, unknown>, warnings: string[]): Record<string, SettingValue> {
  const values: Record<string, SettingValue> = {};
  const put = (label: string, value: SettingValue | undefined): void => {
    if (value === undefined) return;
    if (typeof value === 'string' && !value) return;
    values[label] = value;
  };

  put('窗口标题', text(cfg.WindowName) || undefined);
  put('全局快捷键', hotkeyFromVk(text(cfg.HotKey)) || undefined);
  put('搜索快捷键', hotkeyFromVk(text(cfg.HotKeySearch)) || undefined);
  if (typeof cfg.AutoBackupCount === 'number') put('自动备份', cfg.AutoBackupCount);
  if (typeof cfg.IsTopMost === 'boolean') put('置于顶层', cfg.IsTopMost);

  const close = num(cfg.BtnColseEvent, -1);
  if (close === 0) put('关闭按钮执行动作', '隐藏');
  if (close === 1) put('关闭按钮执行动作', '退出程序');

  const placement = num(cfg.CateDisplayPosition, -1);
  if (placement >= 0) {
    put('分类显示位置', ['左侧', '右侧', '顶部', '底部'][placement] ?? '左侧');
  }

  const view = num(cfg.view_type, -1);
  if (view >= 0) put('项目显示类型', ['列表', '图标', '平铺'][view] ?? '列表');
  const nameLines = num(cfg.view_name, -1);
  if (nameLines >= 1) put('项目名称显示行数', nameLines >= 2 ? '两行' : '一行');
  const iconSize = num(cfg.view_size, -1);
  if (iconSize >= 0) put('项目图标尺寸', ['小图标', '中图标', '大图标'][iconSize] ?? '小图标');

  if (typeof cfg.winRound === 'number') put('窗口圆角', Math.min(14, Math.max(0, cfg.winRound)));

  if (text(cfg.theme)) warnings.push(`主题文件「${text(cfg.theme)}」不在本机主题目录里，没有一起导入。`);
  if (cfg.bjImg_enable === true) warnings.push('旧版背景图存在自己的主题文件里，路径没有记录，需要重新选一次图片。');
  return values;
}

function parseTasks(mdb: Record<string, unknown>, warnings: string[]): TaskSample[] {
  const raw = mdb.taskschd;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  warnings.push(`旧版有 ${raw.length} 条计划任务，字段格式未对齐，先跳过；需要时按任务编辑器手动建。`);
  return [];
}

function radiusFromCfg(cfg: Record<string, unknown>): number | undefined {
  if (typeof cfg.winRound !== 'number') return undefined;
  return Math.min(14, Math.max(0, cfg.winRound));
}

/** 旧版把程序目录写成 %mayelite_path%，导入时换成 MDB.json 所在目录。 */
function expandToolsRoot(value: string, toolsRoot: string): string {
  if (!value || !toolsRoot.trim()) return value;
  const root = toolsRoot.split('/').join('\\').replace(/\\+$/, '');
  return value.replace(/%mayelite_path%/gi, root);
}

/** 解析 MDB.json（必需）与 cfg.json（可选）；toolsRoot 用于展开 %mayelite_path%。 */
export function parseMayeDatabase(mdbText: string, cfgText = '', toolsRoot = ''): MayeImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(mdbText) as unknown;
  } catch {
    throw new Error('文件不是合法 JSON，先确认选的是 MDB.json');
  }
  const mdb = asRecord(parsed);
  if (!Array.isArray(mdb.cate)) throw new Error('这不是 Maye 数据库：缺少 cate 字段');
  if (!Array.isArray(mdb.item)) throw new Error('这不是 Maye 数据库：缺少 item 字段');

  const categoriesMeta = parseCategories(mdb);
  const categoryNames = new Map(categoriesMeta.map((entry) => [entry.id, entry.name]));
  const warnings: string[] = [];
  const stats: MayeStats = {
    categories: categoriesMeta.length,
    items: 0,
    groups: 0,
    passwords: categoriesMeta.filter((entry) => entry.pwd).length,
    tasks: 0,
    skipped: 0,
  };

  const groupOfCategory = new Map<number, string>();
  const items: ToolItem[] = [];
  let nextId = 1;

  for (const raw of parseItems(mdb)) {
    const category = categoryNames.get(raw.idCate);
    if (!category) {
      stats.skipped += 1;
      continue;
    }
    if (raw.flags & GROUP_FLAG) {
      groupOfCategory.set(raw.idCate, raw.name);
      stats.groups += 1;
      continue;
    }
    if (!raw.uri) {
      stats.skipped += 1;
      continue;
    }
    items.push({
      id: nextId++,
      name: raw.name,
      type: typeForTarget(raw.uri),
      group: groupOfCategory.get(raw.idCate) ?? '',
      category,
      parent: '',
      target: expandToolsRoot(raw.uri, toolsRoot),
      args: raw.param,
      start: expandToolsRoot(raw.dir, toolsRoot),
      remark: raw.remark,
      hotkey: hotkeyFromVk(raw.key),
      keywords: raw.kw,
      admin: (raw.flags & 2) === 2,
      icon: raw.icon,
    });
  }
  stats.items = items.length;

  const tasks = parseTasks(mdb, warnings);
  stats.tasks = tasks.length;

  let values: Record<string, SettingValue> = {};
  let radius: number | undefined;
  if (cfgText.trim()) {
    try {
      const cfg = asRecord(JSON.parse(cfgText) as unknown);
      values = valuesFromCfg(cfg, warnings);
      radius = radiusFromCfg(cfg);
    } catch {
      warnings.push('cfg.json 读不懂，只导入了分类与项目。');
    }
  }

  if (stats.passwords > 0) {
    warnings.push(`有 ${stats.passwords} 个分类带口令，QiBox 暂不落库口令，导入后需要重新设置。`);
  }

  return {
    categories: categoriesMeta.map((entry) => entry.name),
    items,
    tasks,
    values,
    radius,
    stats,
    warnings,
  };
}

/** 供设置面板展示的统计摘要。 */
export function summarize(result: MayeImportResult): string {
  const parts = [
    `${result.stats.categories} 个分类`,
    `${result.stats.items} 个项目`,
    `${result.stats.groups} 个分组标题`,
  ];
  if (result.stats.passwords) parts.push(`${result.stats.passwords} 个口令`);
  if (result.stats.skipped) parts.push(`${result.stats.skipped} 条无法识别已跳过`);
  return parts.join(' · ');
}

/** 类型转换后仍要保证字段齐全，避免把脏数据塞进 store。 */
export function normalizeImportedItem(item: ToolItem): ToolItem {
  return {
    ...item,
    group: item.group ?? '',
    parent: item.parent ?? '',
    args: item.args ?? '',
    start: item.start ?? '',
    remark: item.remark ?? '',
    hotkey: item.hotkey ?? '',
    keywords: item.keywords ?? '',
  };
}

