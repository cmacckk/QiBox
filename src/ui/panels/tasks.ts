import type { TaskSample, ToolItem } from '../../domain/types';
import { DEFAULT_TOOLS_ROOT, expandVariables } from '../../domain/variables';
import { store } from '../../state/store';
import { cachedExeDir, killProcess, listProcesses, readLaunchLogs, type ProcessRow } from '../../services/desktop';
import { B, E, icons, toast } from '../dom';
import { check, field, fieldButtons, tabs, table } from '../fields';
import { panelFrame, type PanelContext } from './context';

const TASK_TABS = ['任务列表', '任务配置', '运行日志'];
let taskTab = '任务列表';
let managerTab: 'process' | 'task' = 'process';
let refreshProcesses: (() => void) | null = null;
let cronUnit = '秒';

/** 日志里的时间是毫秒时间戳，这里转成本地 HH:mm:ss。 */
function formatLogTime(stamp: string): string {
  const value = Number(stamp);
  if (!Number.isFinite(value) || value <= 0) return stamp;
  const date = new Date(value);
  const pad = (input: number): string => String(input).padStart(2, '0');
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 从 Quartz 表达式的「分 时」两段推导 schtasks 的 HH:mm；解析不了返回 null。 */
function scheduleTime(expression: string): string | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const minute = Number(parts[1]);
  const hour = Number(parts[2]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** 只生成可复制的 schtasks 文本，绝不执行。 */
function toolsRootValue(): string {
  const value = store.state.values['工具根目录'];
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_TOOLS_ROOT;
}

export function schtasksCommand(task: TaskSample): string {
  const item = store.state.items.find((entry) => entry.name === task.target);
  const rawProgram = item?.target ? item.target : task.target;
  const program = expandVariables(rawProgram, {
    exeDir: cachedExeDir() || '%mp%',
    toolsRoot: toolsRootValue(),
    search: '',
    item: item ?? undefined,
  });
  const args = item?.args ? ` ${item.args}` : '';
  const action = `"${program}"${args}`;
  const name = `"QiBox\\${task.name.trim() || '新任务'}"`;
  if (task.mode === '开机启动') return `schtasks /Create /TN ${name} /TR ${action} /SC ONLOGON /F`;
  if (task.mode === '每次启动') return `schtasks /Create /TN ${name} /TR ${action} /SC ONSTART /F`;
  const time = scheduleTime(task.expression);
  if (!time) {
    return (
      `schtasks /Create /TN ${name} /TR ${action} /SC DAILY /ST 09:00 /F` +
      `\n注意：表达式 ${task.expression} 无法解析，时间按 09:00 生成。`
    );
  }
  return `schtasks /Create /TN ${name} /TR ${action} /SC DAILY /ST ${time} /F`;
}

function selectableItems(): ToolItem[] {
  return store.state.items.filter((item) => !['SPACER', 'TITLE', 'FOLDER'].includes(item.type));
}

function renderSchedule(ctx: PanelContext): void {
  const { body, footer } = panelFrame('任务计划');
  body.append(
    tabs(TASK_TABS, taskTab, (name) => {
      taskTab = name;
      ctx.refresh();
    }),
  );

  if (taskTab === '任务列表') {
    const toolbar = E('div', 'mn-inline');
    toolbar.append(
      B('新建任务', () => ctx.open('taskedit'), 'mn-btn', 'plus'),
      B('刷新', () => toast('演示列表：无需刷新'), 'mn-btn', 'refresh-cw'),
    );
    body.append(toolbar, E('div', 'mn-divider'));
    body.append(
      table(
        ['启用', '名称', '模式', '下次执行时间', '操作'],
        store.state.tasks.map((task, index) => [
          check(`启用任务 ${task.name}`, task.enabled, (checked) => {
            store.update((state) => {
              const target = state.tasks[index];
              if (target) target.enabled = checked;
            });
          }),
          task.name,
          task.mode,
          '示例',
          B('编辑', () => ctx.open('taskedit', { index })),
        ]),
      ),
    );
  } else if (taskTab === '任务配置') {
    const tasks = store.state.tasks;
    body.append(
      field('任务配置', 'select', tasks[0]?.name ?? '', tasks.map((task) => task.name)),
      field('模式', 'select', '定时', ['定时', '开机启动', '每次启动']),
      field('表达式', 'text', '0 0 9 * * ?'),
      B('编辑表达式', () => ctx.open('cron'), 'mn-btn', 'calendar-clock'),
      E('div', 'mn-divider'),
      field(
        '关联项目',
        'select',
        selectableItems()[0]?.name ?? '',
        selectableItems().map((item) => item.name),
      ),
      field('前置任务', 'select', '无', ['无', ...tasks.map((task) => task.name)]),
      field('参数配置', 'textarea', ''),
    );
  } else {
    const box = E('div');
    box.append(E('p', 'mn-note', '读取启动日志中…'));
    const load = (): void => {
      box.textContent = '';
      void readLaunchLogs(300)
        .then((lines) => {
          if (!lines.length) {
            box.append(E('p', 'mn-note', '还没有启动记录。点项目、或用脚本引擎的 mn.open 都会记一行。'));
            return;
          }
          const rows = lines
            .map((line) => line.split('	'))
            .map(([stamp, status, target, detail]) => [
              formatLogTime(stamp),
              status === 'ok' ? '已启动' : '失败',
              target ?? '',
              detail ?? '',
            ]);
          box.append(table(['时间', '结果', '目标', '详情'], rows));
        })
        .catch((error: unknown) => {
          box.append(E('p', 'mn-note', error instanceof Error ? error.message : String(error)));
        });
    };
    body.append(box);
    load();
  }

  footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
  icons();
}

function renderTaskEdit(ctx: PanelContext): void {
  const index = typeof ctx.arg.index === 'number' ? ctx.arg.index : null;
  const source = index === null ? undefined : store.state.tasks[index];
  const draft: TaskSample = {
    name: source?.name ?? '',
    mode: source?.mode ?? '定时',
    expression: source?.expression ?? '0 0 9 * * ?',
    target: source?.target ?? selectableItems()[0]?.name ?? '',
    enabled: source?.enabled ?? true,
  };

  const { body, footer } = panelFrame(source ? '编辑任务' : '新建任务', 'medium');
  const form = E('div', 'mn-form');
  form.append(
    field('名称', 'text', draft.name, [], (value) => {
      draft.name = String(value);
    }),
    check('启用此任务', draft.enabled, (checked) => {
      draft.enabled = checked;
    }),
    field('模式', 'select', draft.mode, ['定时', '开机启动', '每次启动'], (value) => {
      draft.mode = String(value);
    }),
    fieldButtons(
      '表达式',
      draft.expression,
      [['编辑', () => ctx.open('cron'), 'calendar-clock']],
      (value) => {
        draft.expression = value;
      },
    ),
    field('关联项目', 'select', draft.target, selectableItems().map((item) => item.name), (value) => {
      draft.target = String(value);
    }),
    field('前置任务', 'select', '无', ['无', ...store.state.tasks.map((task) => task.name)]),
    field('参数配置', 'textarea', ''),
    check('静默运行', true, () => {}),
  );
  body.append(form);

  const commandBox = E('textarea', 'mn-code');
  commandBox.readOnly = true;
  commandBox.hidden = true;
  const commandRow = E('div', 'mn-inline');
  commandRow.append(
    B(
      '生成命令',
      () => {
        commandBox.value = schtasksCommand(draft);
        commandBox.hidden = false;
      },
      'mn-btn',
      'terminal',
    ),
    B(
      '复制',
      () => {
        if (!commandBox.value) commandBox.value = schtasksCommand(draft);
        commandBox.hidden = false;
        void navigator.clipboard
          ?.writeText(commandBox.value)
          .then(() => toast('命令已复制，未注册任何任务'))
          .catch(() => toast('复制失败，请手动选中文本'));
      },
      'mn-btn',
      'copy',
    ),
  );
  body.append(
    commandRow,
    commandBox,
    E('p', 'mn-note', '只生成 schtasks 文本，不会注册、修改或删除任何计划任务。'),
  );

  footer?.append(
    B('取消', () => ctx.close()),
    B(
      '保存',
      () => {
        if (!draft.name) {
          toast('请输入任务名称');
          return;
        }
        store.update((state) => {
          if (index !== null && state.tasks[index]) state.tasks[index] = draft;
          else state.tasks.push(draft);
        });
        ctx.close();
        toast('已保存演示配置，不会调度任务');
      },
      'mn-btn primary',
    ),
  );
  icons();
}

function renderCron(ctx: PanelContext): void {
  const { body, footer } = panelFrame('定时表达式', 'medium');
  const editor = E('div');

  const draw = (): void => {
    editor.replaceChildren();
    editor.append(
      tabs(['秒', '分', '时', '日', '月', '周', '年'], cronUnit, (unit) => {
        cronUnit = unit;
        draw();
        icons();
      }),
    );
    const form = E('div', 'mn-form');
    form.append(
      field('模式', 'select', '任意 (*)', ['任意 (*)', '不指定 (?)', '范围 (-)', '步进 (/)', '周序 (#)', '固定值']),
      field('从', 'number', 0),
      field('到', 'number', 59),
      field('每隔', 'number', 1),
      field('固定值', 'text', ''),
      E('div', 'mn-divider'),
      field('表达式', 'text', '0 0 9 * * ?'),
      E('p', 'mn-note', '表达式配置界面演示，未连接时间计算和任务调度。'),
    );
    editor.append(form);
  };

  draw();
  body.append(editor);
  footer?.append(B('取消', () => ctx.close()), B('确定', () => ctx.close(), 'mn-btn primary'));
  icons();
}

function renderManager(ctx: PanelContext): void {
  const { body, footer } = panelFrame('任务管理器');
  body.append(
    tabs(['process', 'task'], managerTab, (name) => {
      managerTab = name === 'task' ? 'task' : 'process';
      ctx.refresh();
    }),
  );

  if (managerTab === 'process') {
    const toolbar = E('div', 'mn-inline');
    const search = E('input', 'mn-input');
    search.type = 'search';
    search.placeholder = '按进程名或 PID 过滤';
    toolbar.append(search);
    const box = E('div');
    body.append(toolbar, box);
    let rows: ProcessRow[] = [];
    const draw = (): void => {
      const needle = search.value.trim().toLowerCase();
      const shown = rows.filter(
        (row) => !needle || row.name.toLowerCase().includes(needle) || String(row.pid) === needle,
      );
      box.textContent = '';
      if (!shown.length) {
        box.append(E('p', 'mn-note', rows.length ? '没有匹配的进程' : '读取进程列表失败或列表为空'));
        return;
      }
      box.append(
        table(
          ['进程', 'PID', '内存', '操作'],
          shown.map((row) => [
            row.name,
            String(row.pid),
            `${row.memory_mb.toFixed(1)} MB`,
            B('结束', () =>
              ctx.open('confirm', {
                title: '结束进程',
                message: `确定结束 ${row.name}（PID ${row.pid}）？未保存的数据会丢失。`,
                onConfirm: () => {
                  void killProcess(row.pid)
                    .then(() => {
                      toast(`已结束 ${row.name}`);
                      void load();
                    })
                    .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
                },
              }),
            ),
          ]),
        ),
      );
    };
    const load = (): void => {
      void listProcesses()
        .then((list) => {
          rows = list;
          draw();
        })
        .catch((error: unknown) => {
          box.textContent = '';
          box.append(E('p', 'mn-note', error instanceof Error ? error.message : String(error)));
        });
    };
    search.addEventListener('input', draw);
    refreshProcesses = load;
    load();
  } else {
    body.append(
      table(
        ['#', '任务', '模式', '状态', '操作'],
        store.state.tasks.map((task, index) => [
          String(index + 1),
          task.name,
          task.mode,
          '未运行',
          B('查看', () => ctx.open('taskedit', { index })),
        ]),
      ),
    );
  }

  body.append(
    E(
      'p',
      'mn-note',
      managerTab === 'process'
        ? '进程列表来自本机 Get-Process（只读）；点「结束」会先确认，再调用 taskkill /F。'
        : '任务只记录在你自己的配置里，不会注册到系统计划任务。',
    ),
  );
  footer?.append(
    B('刷新', () => (managerTab === 'process' ? refreshProcesses?.() : ctx.refresh()), 'mn-btn', 'refresh-cw'),
    B('关闭', () => ctx.close(), 'mn-btn primary'),
  );
  icons();
}

export const schedulePanel = {
  title: '任务计划',
  size: 'large' as const,
  render: renderSchedule,
};

export const taskEditPanel = {
  title: '任务配置',
  size: 'medium' as const,
  render: renderTaskEdit,
};

export const cronPanel = {
  title: '定时表达式',
  size: 'medium' as const,
  render: renderCron,
};

export const managerPanel = {
  title: '任务管理器',
  size: 'large' as const,
  render: renderManager,
};
