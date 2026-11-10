import type { PanelArg, PanelName, ToolItem } from '../../domain/types';
import { PLUGIN_DESCRIPTIONS } from '../../data/catalog';
import { store } from '../../state/store';
import { cachedExeDir, isDesktop, launchTool, pickOpenPath } from '../../services/desktop';
import { checkPassword, unlockCategory } from '../../state/unlock';
import { B, E, icons, toast } from '../dom';
import { check, field, fieldButtons, table } from '../fields';
import { panelFrame, type PanelContext } from './context';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 主窗口传来的确认动作必须可序列化，这里统一分派。 */
type ConfirmAction =
  | { kind: 'delete-item'; id: number }
  | { kind: 'delete-items'; ids: number[] }
  | { kind: 'delete-category'; name: string }
  | { kind: 'clear-category'; name: string }
  | { kind: 'delete-tasks' };

function applyAction(action: ConfirmAction | null): void {
  if (!action) return;
  store.update((state) => {
    if (action.kind === 'delete-item') {
      state.items = state.items.filter((item) => item.id !== action.id);
      state.favorites = state.favorites.filter((id) => id !== action.id);
    } else if (action.kind === 'delete-items') {
      const ids = new Set(action.ids);
      state.items = state.items.filter((item) => !ids.has(item.id));
      state.favorites = state.favorites.filter((id) => !ids.has(id));
    } else if (action.kind === 'delete-category') {
      state.categories = state.categories.filter((name) => name !== action.name);
      if (state.category === action.name) state.category = state.categories[0] ?? '信息收集';
    } else if (action.kind === 'clear-category') {
      state.items = state.items.filter((item) => item.category !== action.name);
    } else {
      state.tasks = [];
    }
  });
}

export const confirmPanel = {
  title: (arg: PanelArg) => str(arg.title, '请确认'),
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame(str(ctx.arg.title, '请确认'), 'small');
    body.append(E('p', 'mn-note', str(ctx.arg.message, '确定执行此操作？')));
    footer?.append(
      B('取消', () => ctx.close()),
      B(
        '确定',
        () => {
          const action = ctx.arg.action as ConfirmAction | undefined;
          const onConfirm = ctx.arg.onConfirm;
          ctx.close();
          if (typeof onConfirm === 'function') onConfirm();
          else applyAction(action ?? null);
          toast('已更新本地配置');
        },
        'mn-btn primary',
      ),
    );
    icons();
  },
};

export const categoryPanel = {
  title: (arg: PanelArg) => (str(arg.mode) === '新建' ? '新建分类' : '请输入新分类名称'),
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const mode = str(ctx.arg.mode, '新建');
    const original = str(ctx.arg.name);
    let draft = original;
    const { body, footer } = panelFrame(mode === '新建' ? '新建分类' : '请输入新分类名称', 'small');
    body.append(
      field('分类名称', 'text', draft, [], (value) => {
        draft = String(value);
      }),
      field('显示位置', 'select', '末尾', ['开头', '末尾', '当前分类之后']),
    );
    footer?.append(
      B('取消', () => ctx.close()),
      B(
        '确定',
        () => {
          if (!draft.trim()) {
            toast('请输入分类名称');
            return;
          }
          const name = draft.trim();
          store.update((state) => {
            if (mode === '新建') {
              state.categories.push(name);
            } else {
              const index = state.categories.indexOf(original);
              if (index >= 0) state.categories[index] = name;
              for (const item of state.items) if (item.category === original) item.category = name;
            }
            state.category = name;
          });
          ctx.close();
        },
        'mn-btn primary',
      ),
    );
    icons();
  },
};

export const passwordPanel = {
  title: (arg: PanelArg) => `${str(arg.mode) === 'unlock' ? '解锁' : '设置密码'} · ${str(arg.name)}`,
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const name = str(ctx.arg.name);
    const unlockMode = str(ctx.arg.mode) === 'unlock';
    const existing = store.state.passwords?.[name] ?? '';
    const { body, footer } = panelFrame(`${unlockMode ? '解锁' : '设置密码'} · ${name}`, 'small');

    if (unlockMode) {
      let input = '';
      body.append(
        field('密码', 'password', '', [], (value) => {
          input = String(value);
        }),
        E('p', 'mn-note', '解锁只在本次运行有效，重启后重新上锁。'),
      );
      footer?.append(
        B('取消', () => ctx.close()),
        B(
          '解锁',
          () => {
            if (!checkPassword(store.state, name, input)) {
              toast('密码不正确');
              return;
            }
            unlockCategory(name);
            ctx.close();
            toast(`已解锁「${name}」`);
          },
          'mn-btn primary',
        ),
      );
      icons();
      return;
    }

    let oldValue = '';
    let nextValue = '';
    let confirmValue = '';
    const rows: HTMLElement[] = [];
    if (existing) {
      rows.push(
        field('旧密码', 'password', '', [], (value) => {
          oldValue = String(value);
        }),
      );
    }
    rows.push(
      field('新密码', 'password', '', [], (value) => {
        nextValue = String(value);
      }),
      field('确认密码', 'password', '', [], (value) => {
        confirmValue = String(value);
      }),
      E('p', 'mn-note', '只保存分类访问口令，不会修改任何项目或系统密码；口令是明文存在本机配置里的便捷锁。'),
    );
    body.append(...rows);

    const save = (): void => {
      if (existing && oldValue !== existing) {
        toast('旧密码不正确');
        return;
      }
      if (!nextValue) {
        toast('请输入新密码');
        return;
      }
      if (nextValue !== confirmValue) {
        toast('两次输入不一致');
        return;
      }
      store.update((draft) => {
        draft.passwords[name] = nextValue;
      });
      ctx.close();
      toast(`已为「${name}」设置口令`);
    };

    const clear = (): void => {
      if (existing && oldValue !== existing) {
        toast('先输入旧密码才能清除');
        return;
      }
      store.update((draft) => {
        delete draft.passwords[name];
      });
      ctx.close();
      toast(`已清除「${name}」的口令`);
    };

    footer?.append(B('取消', () => ctx.close()));
    if (existing) footer?.append(B('清除口令', clear, 'mn-btn', 'lock-open'));
    footer?.append(B('保存', save, 'mn-btn primary'));
    icons();
  },
};

export const transferPanel = {
  title: (arg: PanelArg) => `${str(arg.mode, '复制')}到`,
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const mode = str(ctx.arg.mode, '复制');
    const ids = Array.isArray(ctx.arg.ids) ? (ctx.arg.ids as number[]) : [];
    const { body, footer } = panelFrame(`${mode}到`, 'small');
    const categories = store.state.categories;
    let dest = categories[0] ?? '信息收集';
    body.append(
      field('目标分类', 'select', dest, categories, (value) => {
        dest = String(value);
      }),
      check('保留原有分组', true, () => {}),
      E('p', 'mn-note', '只调整本地演示数据，不触碰磁盘文件。'),
    );
    footer?.append(
      B('取消', () => ctx.close()),
      B(
        mode,
        () => {
          store.update((state) => {
            const chosen = state.items.filter((item) => ids.includes(item.id));
            if (mode === '移动') {
              for (const item of chosen) {
                item.category = dest;
                item.parent = '';
              }
            } else {
              for (const item of chosen) {
                state.items.push({
                  ...item,
                  id: Math.max(0, ...state.items.map((entry) => entry.id)) + 1,
                  category: dest,
                  parent: '',
                });
              }
            }
          });
          ctx.close();
          toast('已更新本地配置');
        },
        'mn-btn primary',
      ),
    );
    icons();
  },
};

export const iconPanel = {
  title: '选择图标',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('选择图标', 'small');
    body.append(
      fieldButtons('图标文件', '', [['浏览', () => toast('演示界面：不读取图标文件'), 'folder-open']]),
      field('图标索引', 'number', 0),
    );
    const row = E('div', 'mn-inline');
    const picks: Array<[string, string, 'CLI' | 'GUI']> = [
      ['终端图标', 'square-terminal', 'CLI'],
      ['GUI 图标', 'app-window', 'GUI'],
      ['文件夹图标', 'folder', 'GUI'],
      ['链接图标', 'globe', 'GUI'],
    ];
    for (const [name, icon, runType] of picks) {
      row.append(
        B(
          name,
          () => {
            const onPick = ctx.arg.onPick;
            if (typeof onPick === 'function') onPick(runType);
            ctx.close();
          },
          'mn-btn',
          icon,
        ),
      );
    }
    body.append(E('div', 'mn-divider'), row);
    footer?.append(B('恢复默认', () => toast('演示界面：图标未改动')), B('取消', () => ctx.close()));
    icons();
  },
};

export const browsePanel = {
  title: (arg: PanelArg) => `浏览 · ${str(arg.target)}`,
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const target = str(ctx.arg.target, '路径');
    const { body, footer } = panelFrame(`浏览 · ${target}`, 'small');
    body.append(
      field('路径', 'text', '%mp%\\Tools'),
      E('p', 'mn-note', '仅展示路径选择界面，不读取本地文件。'),
    );
    footer?.append(
      B('取消', () => ctx.close()),
      B('选择', () => {
        ctx.close();
        toast('演示界面：未选择路径');
      }, 'mn-btn primary'),
    );
    icons();
  },
};

export const openWithPanel = {
  title: (arg: PanelArg) => `打开方式 · ${(arg.item as ToolItem | undefined)?.name ?? ''}`,
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const item = ctx.arg.item as ToolItem | undefined;
    const { body, footer } = panelFrame(`打开方式 · ${item?.name ?? ''}`, 'small');
    let program = '';
    const programField = fieldButtons(
      '程序',
      '未选择',
      [
        [
          '选择程序',
          () => {
            void (async () => {
              const picked = await pickOpenPath();
              if (!picked) return;
              program = picked;
              const input = programField.querySelector('input');
              if (input) input.value = picked;
            })();
          },
          'folder-search',
        ],
        [
          '命令提示符',
          () => {
            program = 'cmd.exe';
            const input = programField.querySelector('input');
            if (input) input.value = 'cmd.exe';
          },
          'terminal',
        ],
        [
          'PowerShell',
          () => {
            program = 'powershell.exe';
            const input = programField.querySelector('input');
            if (input) input.value = 'powershell.exe';
          },
          'square-terminal',
        ],
      ],
      (value) => {
        program = value.trim();
      },
    );
    const input = programField.querySelector('input');
    if (input) input.placeholder = '例如 notepad.exe 或完整路径';
    const argsField = field('附加参数', 'text', '');
    const adminBox = check('以管理员权限运行', item?.admin === true, () => {});
    body.append(
      programField,
      argsField,
      adminBox,
      E('p', 'mn-note', item ? `将用所选程序打开：${item.target || item.name}` : '未指定项目。'),
    );
    footer?.append(
      B('取消', () => ctx.close()),
      B(
        '打开',
        () => {
          const target = program.trim() || 'notepad.exe';
          const extra = argsField.querySelector('input')?.value.trim() ?? '';
          const argument = [extra, item?.target ? `"${item.target}"` : '']
            .filter(Boolean)
            .join(' ')
            .trim();
          const enabled = adminBox.querySelector('input')?.checked === true;
          if (!isDesktop()) {
            toast(`浏览器预览不会启动程序（${target}）`);
            return;
          }
          ctx.close();
          void launchTool({ target, args: argument, workDir: item?.start ?? '', admin: enabled })
            .then(() => toast(`已用 ${target} 打开`))
            .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
        },
        'mn-btn primary',
      ),
    );
    icons();
  },
};

export const batchPanel = {
  title: (arg: PanelArg) => (str(arg.mode) === '分组' ? '批量改分组' : '批量改分类'),
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const ids = (Array.isArray(ctx.arg.ids) ? ctx.arg.ids : []).filter(
      (id): id is number => typeof id === 'number',
    );
    const mode = str(ctx.arg.mode, '分类');
    const { body, footer } = panelFrame(mode === '分组' ? '批量改分组' : '批量改分类', 'small');
    const selected = new Set(ids);
    const groups = [
      ...new Set(
        store.state.items.filter((item) => selected.has(item.id)).map((item) => item.group ?? ''),
      ),
    ].filter(Boolean);
    let category = store.state.category;
    let group = groups[0] ?? '';
    body.append(E('p', 'mn-note', `将修改 ${ids.length} 个项目，分类不存在的项会自动移除。`));
    if (mode === '分组') {
      const groupField = field('分组名称', 'text', group);
      const input = groupField.querySelector('input');
      if (input) {
        input.placeholder = '留空表示不分组';
        input.addEventListener('input', () => {
          group = input.value.trim();
        });
      }
      body.append(groupField);
      if (groups.length) {
        body.append(
          field('已有分组', 'select', groups[0], groups, (value) => {
            group = String(value);
            if (input) input.value = group;
          }),
        );
      }
    } else {
      body.append(
        field('目标分类', 'select', category, store.state.categories, (value) => {
          category = String(value);
        }),
      );
    }
    footer?.append(
      B('取消', () => ctx.close()),
      B(
        '应用',
        () => {
          if (!ids.length) {
            toast('没有选中项目');
            return;
          }
          store.update((state) => {
            for (const item of state.items) {
              if (!selected.has(item.id)) continue;
              if (mode === '分组') item.group = group;
              else item.category = category;
            }
            if (mode !== '分组') state.category = category;
          });
          ctx.close();
          toast(mode === '分组' ? `已更新 ${ids.length} 个项目的分组` : `已移动到「${category}」`);
        },
        'mn-btn primary',
      ),
    );
    icons();
  },
};

export const hotkeyCapturePanel = {
  title: '按键',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('按键', 'small');
    let captured = '';
    const wrap = field('快捷键', 'text', '按下组合键');
    const input = wrap.querySelector('input');
    if (input) {
      input.addEventListener('keydown', (event) => {
        event.preventDefault();
        captured = [
          event.ctrlKey ? 'Ctrl' : '',
          event.altKey ? 'Alt' : '',
          event.shiftKey ? 'Shift' : '',
          event.metaKey ? 'Win' : '',
          ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key) ? '' : event.key.toUpperCase(),
        ]
          .filter(Boolean)
          .join(' + ');
        input.value = captured;
      });
    }
    body.append(wrap, field('模式', 'select', '热键模式', ['热键模式', '输入模式']));
    footer?.append(
      B('取消', () => ctx.close()),
      B('确定', () => {
        const onCapture = ctx.arg.onCapture;
        if (typeof onCapture === 'function' && captured) onCapture(captured);
        ctx.close();
      }, 'mn-btn primary'),
    );
    icons();
    window.setTimeout(() => input?.focus(), 0);
  },
};

export const scopePanel = {
  title: '匹配范围',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('匹配范围', 'medium');
    const form = E('div', 'mn-form');
    for (const label of ['顶级窗口标题', '父窗口标题', '窗口标题', '顶级窗口类名', '父窗口类名', '窗口类名', '文件名', '路径']) {
      form.append(field(label, 'text', ''));
    }
    body.append(form, check('全局应用（不匹配关键词）', false, () => {}));
    footer?.append(B('取消', () => ctx.close()), B('确定', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};

export const variablesPanel = {
  title: '参数变量',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('参数变量', 'medium');
    body.append(
      table(
        ['变量', '说明', '适用字段'],
        [
          ['%mp%', '当前目录', '目标 / 起始位置 / 参数 / 图标'],
          ['%mr%', '当前盘符', '目标 / 起始位置 / 参数 / 图标'],
          ['%so%', '搜索参数', '目标 / 起始位置 / 启动参数'],
          ['%so-url%', '搜索参数 URL 编码', '目标 / 起始位置 / 启动参数'],
          ['%PATH%', 'Windows 环境变量', '支持环境变量的字段'],
        ],
      ),
    );
    footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};

export const pluginPanel = {
  title: (arg: PanelArg) => `扩展配置 · ${str(arg.name)}`,
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const name = str(ctx.arg.name, '扩展');
    const keywords: Record<string, string> = { Calc: 'calc', Cmd: '> ; 》', Run: '< ; 《', Hash: '#', Rand: 'rd' };
    const { body, footer } = panelFrame(`扩展配置 · ${name}`, 'medium');
    const form = E('div', 'mn-form');
    form.append(
      field('名称', 'text', name),
      field('关键词', 'text', keywords[name] ?? ''),
      check('出现在全局结果内', name === 'Calc', () => {}),
      check('正则匹配 Key', name === 'Calc', () => {}),
      field('匹配范围', 'select', '全局', ['全局', '当前分类']),
      field('配置参数', 'textarea', '{}'),
    );
    body.append(form, E('p', 'mn-note', PLUGIN_DESCRIPTIONS[name] ?? '扩展配置演示，不加载外部代码。'));
    footer?.append(
      B('取消', () => ctx.close()),
      B('保存', () => {
        ctx.close();
        toast('演示界面：未保存扩展配置');
      }, 'mn-btn primary'),
    );
    icons();
  },
};

export const installPluginPanel = {
  title: '安装扩展',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('安装扩展', 'small');
    body.append(
      fieldButtons('扩展文件', '', [['浏览', () => toast('演示界面：不读取扩展文件'), 'folder-open']]),
      field('扩展 ID', 'text', 'mn.cc.example'),
      E('p', 'mn-note', '仅展示扩展安装入口，不加载外部代码。'),
    );
    footer?.append(
      B('取消', () => ctx.close()),
      B('安装', () => {
        ctx.close();
        toast('演示界面：未安装扩展');
      }, 'mn-btn primary'),
    );
    icons();
  },
};

export const hotkeysPanel = {
  title: '项目快捷键',
  size: 'large' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('项目快捷键');
    const named = ['Nmap', 'Windows Terminal', 'Onyx-v1.9.4', '示例脚本'];
    const rows = store.state.items
      .filter((item) => named.includes(item.name))
      .map((item) => [
        item.name,
        item.hotkey || '未设置',
        '热键模式',
        '全局',
        B('编辑', () => ctx.open('editor', { item, tab: '快捷键' })),
      ]);
    body.append(table(['项目', '快捷键', '模式', '匹配范围', '操作'], rows));
    body.append(E('p', 'mn-note', '项目快捷键界面；当前版本不注册系统热键。'));
    footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};

function toRelativePath(value: string, base: string): string {
  if (!value || value.startsWith('%')) return value;
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const baseNormalized = base.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  if (!baseNormalized || normalized === baseNormalized) return value;
  if (normalized.startsWith(`${baseNormalized}/`)) {
    const rest = value.slice(base.length).replace(/^[\\/]+/, '');
    return `%mp%\\${rest}`;
  }
  return value;
}
function toAbsolutePath(value: string, base: string): string {
  if (!value) return value;
  return value.replace(/%mp%/gi, base).replace(/%tools%/gi, base);
}

export const pathPanel = {
  title: (arg: PanelArg) => `路径转换 · ${str(arg.mode)}`,
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const mode = str(ctx.arg.mode, '绝对路径');
    const { body, footer } = panelFrame(`路径转换 · ${mode}`, 'medium');
    const base = cachedExeDir() || '%mp%';
    let direction = mode.includes('相对') ? '相对路径' : '绝对路径';
    let scope = '当前分类';
    const flags = { target: true, start: true, icon: true };
    const preview = E('textarea', 'mn-code');
    preview.readOnly = true;
    preview.rows = 3;
    preview.value = '';

    body.append(
      field('范围', 'select', scope, ['当前分类', '所有项目'], (value) => {
        scope = String(value);
      }),
      field('转换为', 'select', direction, ['绝对路径', '相对路径'], (value) => {
        direction = String(value);
      }),
      check('包含目标', flags.target, (value) => {
        flags.target = value;
      }),
      check('包含起始位置', flags.start, (value) => {
        flags.start = value;
      }),
      check('包含图标路径', flags.icon, (value) => {
        flags.icon = value;
      }),
      E('p', 'mn-note', `基准目录：${base}`),
      preview,
      E('p', 'mn-note', '绝对路径以程序目录为基准，相对路径写成 %mp% 开头的形式；只改写勾选的字段。'),
    );

    footer?.append(
      B('取消', () => ctx.close()),
      B(
        '转换',
        () => {
          const convert = direction === '相对路径' ? toRelativePath : toAbsolutePath;
          let changed = 0;
          const lines: string[] = [];
          const current = store.state.category;
          store.update((draft) => {
            for (const item of draft.items) {
              if (scope === '当前分类' && item.category !== current) continue;
              if (flags.target && item.target) {
                const next = convert(item.target, base);
                if (next !== item.target) {
                  lines.push(`${item.name} 目标：${item.target} -> ${next}`);
                  item.target = next;
                  changed += 1;
                }
              }
              if (flags.start && item.start) {
                const next = convert(item.start, base);
                if (next !== item.start) {
                  lines.push(`${item.name} 起始位置：${item.start} -> ${next}`);
                  item.start = next;
                  changed += 1;
                }
              }
              if (flags.icon && item.icon && !item.icon.startsWith('file:')) {
                const next = convert(item.icon, base);
                if (next !== item.icon) {
                  item.icon = next;
                  changed += 1;
                }
              }
            }
          });
          preview.value = lines.slice(0, 8).join('\n') || '没有需要转换的路径';
          toast(changed ? `已转换 ${changed} 处路径` : '没有需要转换的路径');
        },
        'mn-btn primary',
      ),
    );
    icons();
  },
};

export const updatePanel = {
  title: '检查更新',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('检查更新', 'small');
    body.append(
      E('p', 'mn-note', '更新界面演示，未连接更新服务。'),
      field('参考版本', 'text', '7.0.1.261107'),
      field('检查状态', 'text', '未连接更新服务'),
    );
    footer?.append(
      B('取消', () => ctx.close()),
      B('下载更新', () => toast('演示界面：未连接更新服务'), 'mn-btn primary', 'download'),
    );
    icons();
  },
};

export const buildPanel = {
  title: '构建信息',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('构建信息', 'small');
    body.append(
      table(
        ['字段', '信息'],
        [
          ['界面', 'QiBox 桌面外壳'],
          ['参考', 'Maye Nano 公开截图与语言文件'],
          ['参考版本', '7.0.1.261107'],
          ['主界面', '白色 / 蓝灰 / 6 px 圆角'],
          ['运行能力', '演示数据 · 未接入系统调用'],
        ],
      ),
    );
    footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};

export const sourcesPanel = {
  title: '界面参考',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('界面参考', 'medium');
    const sources: Array<[string, string]> = [
      ['Maye Nano 官方主页', 'https://mayenano.arae.cc/'],
      ['官方项目与截图', 'https://github.com/25H/MayeNano'],
      ['官方中文语言文件', 'https://github.com/25H/MayeNano/blob/main/lang/zh-CN.json'],
      ['版本更新记录', 'https://github.com/25H/MayeNano/releases/tag/7.0.1.261107'],
    ];
    for (const [label, url] of sources) {
      const line = E('p', 'mn-note');
      const anchor = E('a', '', label);
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      line.append(anchor);
      body.append(line);
    }
    footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};

function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index >= 0 ? path.slice(index + 1) : path;
}

function kindOf(path: string): ToolItem['type'] {
  const name = baseName(path).toLowerCase();
  if (/\.(exe|com|lnk|appref-ms)$/.test(name)) return 'GUI';
  if (/\.(bat|cmd|ps1|py|sh|js|mjs|vbs)$/.test(name)) return 'SCRIPT';
  if (/\.url$/.test(name)) return 'URL';
  if (/^https?:\/\//i.test(name)) return 'URL';
  if (!name.includes('.')) return 'FOLDER';
  return 'REGULAR';
}

export const dropPanel = {
  title: '批量添加项目',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const paths = Array.isArray(ctx.arg.paths) ? (ctx.arg.paths as string[]) : [];
    const names = Array.isArray(ctx.arg.names) ? (ctx.arg.names as string[]) : [];
    const entries = paths.length
      ? paths.map((path) => ({ name: baseName(path), target: path, type: kindOf(path) }))
      : names.map((name) => ({ name, target: '', type: kindOf(name) }));
    const { body, footer } = panelFrame('批量添加项目', 'medium');

    if (!entries.length) {
      body.append(E('p', 'mn-note', '没有收到文件。把文件或文件夹拖到主窗口上即可添加。'));
      footer?.append(B('关闭', () => ctx.close()));
      icons();
      return;
    }

    const rows = entries.slice(0, 60).map((entry) => [entry.name, entry.type, entry.target || '（浏览器预览拿不到完整路径）']);
    body.append(
      table(['名称', '类型', '目标'], rows),
      entries.length > rows.length ? E('p', 'mn-note', `另有 ${entries.length - rows.length} 个文件同样会导入。`) : E('p', 'mn-note', ''),
    );

    let category = store.state.category;
    body.append(
      E('div', 'mn-divider'),
      field('目标分类', 'select', category, store.state.categories, (value) => {
        category = String(value);
      }),
      E('p', 'mn-note', '文件夹会作为虚拟文件夹导入；不会复制、移动或执行这些文件。'),
    );

    footer?.append(
      B('取消', () => ctx.close()),
      B(
        '添加',
        () => {
          if (entries.some((entry) => !entry.target)) {
            toast('浏览器预览拿不到完整路径，请用桌面端拖放');
            return;
          }
          let added = 0;
          store.update((draft) => {
            let nextId = draft.items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
            for (const entry of entries) {
              draft.items.push({
                id: nextId,
                name: entry.name,
                type: entry.type,
                group: '',
                category,
                parent: '',
                target: entry.target,
                args: '',
                start: '',
                remark: '',
                hotkey: '',
                keywords: '',
              });
              nextId += 1;
              added += 1;
            }
            draft.category = category;
          });
          ctx.close();
          toast(`已添加 ${added} 个项目到「${category}」`);
        },
        'mn-btn primary',
      ),
    );
    icons();
  },
};

const PICKER_ICONS = [
  'square-terminal',
  'app-window',
  'folder',
  'folder-open',
  'globe',
  'file-code',
  'file-text',
  'terminal',
  'shield',
  'shield-check',
  'bug',
  'scan-line',
  'radar',
  'key',
  'round-keyhole',
  'lock',
  'database',
  'server',
  'cloud',
  'wifi',
  'network',
  'cpu',
  'monitor',
  'wrench',
  'hammer',
  'settings',
  'play',
  'search',
  'fingerprint',
  'eye',
  'zap',
  'box',
  'package',
  'git-branch',
  'code',
  'binary',
  'hash',
  'radio',
  'satellite',
  'signal',
  'map',
  'crosshair',
  'target',
  'flame',
  'skull',
  'biohazard',
  'syringe',
  'layers',
  'boxes',
  'archive',
  'clipboard',
  'calendar',
  'clock',
  'timer',
  'repeat',
  'refresh-cw',
  'download',
  'upload',
  'link',
  'mail',
  'message-square',
  'users',
  'user',
  'bot',
  'brain',
  'sparkles',
  'trophy',
  'star',
  'bookmark',
  'tag',
  'filter',
  'list',
  'grid',
  'layout',
  'panel-left',
  'menu',
  'plus',
  'x',
  'check',
  'alert-triangle',
  'info',
  'help-circle',
  'book-open',
  'graduation-cap',
  'briefcase',
  'building',
  'home',
  'container',
  'ship',
  'anchor',
  'compass',
  'navigation',
  'route',
  'workflow',
  'hard-drive',
  'usb',
  'bluetooth',
  'battery',
  'power',
  'plug',
  'cable',
  'printer',
];

/** Lucide 图标选择器：只在同一窗口内回调，选完即关。 */
export const iconPickPanel = {
  title: '选择图标',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('选择图标', 'medium');
    const grid = E('div', 'mn-icongrid');
    const search = field('搜索图标', 'text', '', [], (value) => {
      const query = String(value).trim().toLowerCase();
      grid.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        button.hidden = query !== '' && !(button.dataset.name ?? '').includes(query);
      });
    });
    const onPick = ctx.arg.onPick;
    for (const name of PICKER_ICONS) {
      const button = B('', () => {
        if (typeof onPick === 'function') onPick(name);
        ctx.close();
      }, 'mn-iconchoice', name);
      button.dataset.name = name;
      button.title = name;
      button.setAttribute('aria-label', name);
      grid.append(button);
    }
    body.append(search, grid, E('p', 'mn-note', '图标名会被写入项目数据，可在编辑器里直接修改。'));
    footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};

export function simplePanelFactory(title: string) {
  return {
    title,
    size: 'small' as const,
    render(ctx: PanelContext): void {
      const { body, footer } = panelFrame(title, 'small');
      body.append(E('p', 'mn-note', '此操作仅展示界面，不访问或更改系统。'));
      footer?.append(B('确定', () => ctx.close(), 'mn-btn primary'));
      icons();
    },
  };
}

/** 供注册表兜底：未知面板名也能给出可关闭的提示。 */
export function unknownPanel(name: PanelName | string) {
  return simplePanelFactory(`面板 · ${name}`);
}

export { str as textArg, num as numberArg };
