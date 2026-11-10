import type { ItemKind, PanelArg, ToolItem } from '../../domain/types';
import { builtinEntries } from '../../data/lang';
import { store } from '../../state/store';
import { listWslDistros, pickImagePath, pickProgramPath } from '../../services/desktop';
import { B, E, icons, toast } from '../dom';
import { check, field, fieldButtons, hotkeyField, tabs } from '../fields';
import { panelFrame, type PanelContext } from './context';

type EditorTab = '基本' | '快捷键' | '任务配置' | '高级';
type RegularKind = Exclude<ItemKind, 'CLI' | 'GUI'>;

interface EditorDraft {
  id: number | null;
  name: string;
  type: RegularKind;
  runType: 'GUI' | 'CLI';
  target: string;
  args: string;
  start: string;
  remark: string;
  hotkey: string;
  keywords: string;
  admin: boolean;
  icon: string;
  runner: string;
  env: 'local' | 'wsl';
  wslDistro: string;
  wslCwd: string;
  priority: string;
  code: string;
  taskEnabled: boolean;
}

const TYPE_NAMES: Record<RegularKind, string> = {
  REGULAR: '常规项目',
  URL: 'Url',
  APPX: 'Appx',
  FOLDER: '虚拟文件夹',
  SCRIPT: 'Script',
  TITLE: '标题',
  SPACER: '空白占位',
  BUILTIN: '内置项目',
};

const TYPE_ORDER: RegularKind[] = [
  'REGULAR',
  'URL',
  'APPX',
  'FOLDER',
  'SCRIPT',
  'BUILTIN',
  'TITLE',
  'SPACER',
];

const DEFAULT_DISTRO = '默认发行版';
let wslDistros: string[] = [];
let wslLoaded = false;
let wslLoading = false;

function ensureWslDistros(ctx: PanelContext): void {
  if (wslLoaded || wslLoading) return;
  wslLoading = true;
  void listWslDistros().then((names) => {
    wslDistros = names;
    wslLoaded = true;
    wslLoading = false;
    ctx.refresh();
  });
}

function distroOptions(current: string): string[] {
  const names = wslDistros.filter((name) => name !== DEFAULT_DISTRO);
  if (current && !names.includes(current)) names.unshift(current);
  return [DEFAULT_DISTRO, ...names];
}

let editorTab: EditorTab = '基本';
let draft: EditorDraft | null = null;
let draftSource: PanelArg | null = null;

function makeDraft(arg: PanelArg): EditorDraft {
  const item = arg.item as ToolItem | undefined;
  const requested = (arg.type as ItemKind | undefined) ?? item?.type ?? 'REGULAR';
  const type: RegularKind =
    requested === 'CLI' || requested === 'GUI' ? 'REGULAR' : (requested as RegularKind);
  return {
    id: item?.id ?? null,
    name: item?.name ?? '',
    type,
    runType: item?.type === 'CLI' ? 'CLI' : 'GUI',
    target: item?.target ?? '',
    args: item?.args ?? '',
    start: item?.start ?? '',
    remark: item?.remark ?? '',
    hotkey: item?.hotkey ?? '',
    keywords: item?.keywords ?? '',
    admin: item?.admin === true,
    icon: item?.icon ?? '',
    runner: item?.runner ?? '',
    env: item?.env === 'wsl' ? 'wsl' : 'local',
    wslDistro: item?.wslDistro ?? '',
    wslCwd: item?.wslCwd ?? '',
    priority: '正常',
    code: '// 演示代码，不会被解释执行\nmn.log("Hello, QiBox");\nmn.exit();',
    taskEnabled: false,
  };
}

function saveDraft(current: EditorDraft, ctx: PanelContext): void {
  if (!current.name.trim()) {
    toast('请输入项目名称');
    return;
  }
  store.update((state) => {
    const existing = current.id === null ? undefined : state.items.find((item) => item.id === current.id);
    const target =
      existing ??
      ({
        id: Math.max(0, ...state.items.map((item) => item.id)) + 1,
        category: state.category,
        parent: '',
        group: '我的工具',
      } as ToolItem);
    if (!existing) state.items.push(target);
    Object.assign(target, {
      name: current.name,
      type: current.type === 'REGULAR' ? current.runType : current.type,
      target: current.target,
      args: current.args,
      start: current.start,
      remark: current.remark,
      hotkey: current.hotkey,
      keywords: current.keywords,
      admin: current.admin,
      icon: current.icon,
      runner: current.runner,
      env: current.env,
      wslDistro: current.env === 'wsl' ? current.wslDistro : '',
      wslCwd: current.env === 'wsl' ? current.wslCwd : '',
    });
  });
  ctx.close();
  toast('已保存');
}

function renderBasic(form: HTMLElement, current: EditorDraft, ctx: PanelContext): void {
  const names = TYPE_ORDER.map((key) => TYPE_NAMES[key]);
  form.append(
    field('项目类型', 'select', TYPE_NAMES[current.type], names, (value) => {
      const key = TYPE_ORDER.find((item) => TYPE_NAMES[item] === value);
      if (!key) return;
      current.type = key;
      ctx.refresh();
    }),
    field('名称', 'text', current.name, [], (value) => {
      current.name = String(value);
    }),
  );

  if (!['TITLE', 'SPACER', 'FOLDER', 'SCRIPT'].includes(current.type)) {
    form.append(
      field('启动类型', 'select', current.runType, ['GUI', 'CLI'], (value) => {
        current.runType = value === 'CLI' ? 'CLI' : 'GUI';
      }),
      fieldButtons(
        current.type === 'URL'
          ? '网址'
          : current.type === 'APPX'
            ? 'Appx 标识'
            : current.env === 'wsl'
              ? 'WSL 命令'
              : '目标',
        current.target,
        [['浏览', () => ctx.open('browse', { target: '目标' }), 'folder-open']],
        (value) => {
          current.target = value;
        },
      ),
    );
  }

  if (current.type === 'REGULAR') {
    if (current.env === 'wsl') ensureWslDistros(ctx);
    form.append(
      field('启动参数', 'text', current.args, [], (value) => {
        current.args = String(value);
      }),
      ...(current.env === 'wsl'
        ? []
        : [
            fieldButtons(
              '工作目录',
              current.start,
              [['浏览', () => ctx.open('browse', { target: '工作目录' }), 'folder-open']],
              (value) => {
                current.start = value;
              },
            ),
          ]),
      field('运行环境', 'select', current.env === 'wsl' ? 'WSL' : '本机', ['本机', 'WSL'], (value) => {
        current.env = value === 'WSL' ? 'wsl' : 'local';
        ctx.refresh();
      }),
      ...(current.env === 'wsl'
        ? [
            field(
              '发行版',
              'select',
              current.wslDistro || DEFAULT_DISTRO,
              distroOptions(current.wslDistro),
              (value) => {
                current.wslDistro = value === DEFAULT_DISTRO ? '' : String(value);
              },
            ),
            field('WSL 工作目录', 'text', current.wslCwd, [], (value) => {
              current.wslCwd = String(value);
            }),
            E(
              'p',
              'mn-note',
              'WSL 命令直接写 Linux 命令（如 nmap），工作目录写 Linux 路径（如 /root/tools）。发行版留空表示默认发行版，可用 wsl --list 查看。管理员勾选在 WSL 内不生效，需要时在命令里写 sudo。',
            ),
          ]
        : []),
      field('解释器', 'text', current.runner, [], (value) => {
        current.runner = String(value);
      }),
      E('p', 'mn-note', '解释器留空时按扩展名自动选择：ps1→powershell、bat/cmd→cmd、py→python、js→node。'),
      check('以管理员权限运行', current.admin, (checked) => {
        current.admin = checked;
      }),
    );
  }

  if (current.type === 'SCRIPT') {
    const code = E('textarea', 'mn-code');
    code.value = current.code;
    code.setAttribute('aria-label', 'Script 代码');
    code.addEventListener('input', () => {
      current.code = code.value;
    });
    form.append(code);
    const row = E('div', 'mn-inline');
    row.append(
      B('执行', () => toast('演示界面：脚本不会被执行'), 'mn-btn', 'play'),
      B('参数变量', () => ctx.open('variables'), 'mn-btn', 'braces'),
    );
    form.append(row);
  }

  if (current.type === 'FOLDER') {
    form.append(
      check('运行全部前确认', true, () => {}),
      E('p', 'mn-note', '虚拟文件夹可包含项目和下一级文件夹。'),
    );
  }

  if (current.type === 'BUILTIN') {
    form.append(
      field(
        '内置动作',
        'select',
        current.target || builtinEntries()[0]?.[1] || '',
        builtinEntries().map(([, name]) => name),
        (value) => {
          current.target = String(value);
        },
      ),
    );
  }

  if (current.type !== 'SPACER') {
    form.append(
      fieldButtons(
        '图标',
        current.icon || (current.runType === 'CLI' ? 'square-terminal' : 'app-window'),
        [
          [
            '选择',
            () =>
              ctx.open('iconpick', {
                onPick: (name: string) => {
                  current.icon = name;
                  ctx.refresh();
                },
              }),
            'image',
          ],
          [
            '图片',
            () => {
              void pickImagePath().then((path) => {
                if (!path) return;
                current.icon = `file:${path}`;
                ctx.refresh();
              });
            },
            'folder-open',
          ],
          [
            '程序',
            () => {
              void pickProgramPath().then((path) => {
                if (!path) return;
                current.icon = `file:${path}`;
                ctx.refresh();
              });
            },
            'app-window',
          ],
        ],
        (value) => {
          current.icon = value.trim();
        },
      ),
      E(
        'p',
        'mn-note',
        '图标可填 Lucide 名称（如 square-terminal）；「图片」选 png/ico/webp 等，「程序」选 exe/dll 自动抽图标。配置里只存路径，可以写相对路径（相对程序目录）或带 %mp% 变量，例如 Tools\Nmap\nmap.ico。留空按启动类型取默认图标。',
      ),
    );
  }

  form.append(
    field('搜索关键词', 'text', current.keywords, [], (value) => {
      current.keywords = String(value);
    }),
    field('备注', 'textarea', current.remark, [], (value) => {
      current.remark = String(value);
    }),
  );
}

function renderHotkey(form: HTMLElement, current: EditorDraft, ctx: PanelContext): void {
  form.append(
    hotkeyField('快捷键', current.hotkey, (value) => {
      current.hotkey = value;
    }),
    field('模式', 'select', '热键模式', ['热键模式', '输入模式']),
    field('匹配范围', 'select', '全局', ['全局', '任务栏', '桌面', '指定窗口']),
    check('全局应用（不匹配关键词）', true, () => {}),
    field('关键词限定', 'text', '*'),
    field('窗口标题', 'text', ''),
    field('窗口类名', 'text', ''),
    B('设置匹配范围', () => ctx.open('scope'), 'mn-btn', 'scan'),
  );
}

function renderTaskConfig(form: HTMLElement, current: EditorDraft, ctx: PanelContext): void {
  form.append(
    check('启用任务配置', current.taskEnabled, (checked) => {
      current.taskEnabled = checked;
    }),
    field('模式', 'select', '定时', ['定时', '开机启动', '每次启动']),
    field('表达式', 'text', '0 0 9 * * ?'),
    B('编辑定时表达式', () => ctx.open('cron'), 'mn-btn', 'calendar-clock'),
    field('参数配置', 'textarea', ''),
    field('进程优先级', 'select', '正常', ['高', '高于正常', '正常', '低于正常', '低']),
    E('p', 'mn-note', '任务配置界面演示，不注册或执行任务。'),
  );
}

function renderAdvanced(form: HTMLElement, current: EditorDraft, ctx: PanelContext): void {
  form.append(
    field('进程优先级', 'select', current.priority, ['高', '高于正常', '正常', '低于正常', '低'], (value) => {
      current.priority = String(value);
    }),
    field('打开方式', 'select', '正常', ['正常', '最小化', '最大化']),
    check('运行前确认', false, () => {}),
    check('排除搜索', false, () => {}),
    field('快捷键范围', 'text', '全局'),
    B('参数变量', () => ctx.open('variables'), 'mn-btn', 'braces'),
  );
}

export const editorPanel = {
  title: (arg: PanelArg) => {
    const item = arg.item as ToolItem | undefined;
    const mode = item ? '编辑' : '新建';
    return `${mode} · ${item?.name || TYPE_NAMES[((arg.type as RegularKind) ?? 'REGULAR')] || '常规项目'}`;
  },
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    if (draftSource !== ctx.arg) {
      draft = makeDraft(ctx.arg);
      draftSource = ctx.arg;
      editorTab = (ctx.arg.tab as EditorTab | undefined) ?? '基本';
    }
    const current = draft;
    if (!current) return;

    const label = current.name || TYPE_NAMES[current.type];
    const { body, footer } = panelFrame(
      `${current.id === null ? '新建' : '编辑'} · ${label}`,
      'medium',
    );

    body.append(
      tabs(['基本', '快捷键', '任务配置', '高级'], editorTab, (name) => {
        editorTab = name as EditorTab;
        ctx.refresh();
      }),
    );

    const form = E('div', 'mn-form');
    body.append(form);
    if (editorTab === '基本') renderBasic(form, current, ctx);
    else if (editorTab === '快捷键') renderHotkey(form, current, ctx);
    else if (editorTab === '任务配置') renderTaskConfig(form, current, ctx);
    else renderAdvanced(form, current, ctx);

    footer?.append(
      B('取消', () => ctx.close()),
      B('保存', () => saveDraft(current, ctx), 'mn-btn primary', 'check'),
    );
    icons();
  },
};
