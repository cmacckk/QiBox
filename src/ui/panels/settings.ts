import { DEFAULT_PLUGINS, PLUGIN_DESCRIPTIONS, THEME_ACCENTS } from '../../data/catalog';
import { L, settingLabel } from '../../data/lang';
import { DEFAULT_TOOLS_ROOT } from '../../domain/variables';
import type { SettingValue } from '../../domain/types';
import { store } from '../../state/store';
import { B, E, icons, toast } from '../dom';
import { check, field, fieldButtons, fontField, hotkeyField, type FieldType } from '../fields';
import { chooseBackground, clearBackground } from '../../ui/background';
import { pickDirectory, setAutostart } from '../../services/desktop';
import { panelFrame, type PanelContext } from './context';

type Spec = [key: number | string, type: FieldType, fallback: SettingValue, options?: string[]];

const SETS: Record<string, Array<[string, Spec[]]>> = {
  常规: [
    [
      '常规',
      [
        [1, 'select', '简体中文', ['简体中文', 'English', '繁體中文']],
        [2, 'check', false],
        [57, 'check', true],
        [3, 'check', false],
        [4, 'check', true],
        [5, 'check', false],
        [6, 'check', false],
        [58, 'select', '隐藏', ['隐藏', '退出']],
        ['工具根目录', 'text', DEFAULT_TOOLS_ROOT],
      ],
    ],
    [
      '托盘',
      [
        [7, 'select', '彩色（默认）', ['彩色（默认）', '白色', '黑色', '隐藏']],
        [51, 'check', true],
      ],
    ],
    [
      '拖放',
      [
        [8, 'check', true],
        [10, 'check', true],
        [11, 'select', '复制', ['复制', '移动']],
        [12, 'check', true],
        [60, 'check', true],
      ],
    ],
    [
      '数据',
      [
        [56, 'number', 10],
        [59, 'select', '每次唤醒', ['每次唤醒', '每次切换分类', '每次唤醒或切换分类', '仅一次']],
      ],
    ],
    [
      '进阶',
      [
        [13, 'check', false],
        [14, 'check', true],
        [15, 'check', true],
        [16, 'number', 2],
        [53, 'number', 4],
        [9, 'check', true],
      ],
    ],
  ],
  动作: [
    [
      '动作',
      [
        [17, 'check', false],
        [18, 'check', false],
        [55, 'check', false],
        [69, 'check', true],
        [70, 'check', true],
        [71, 'check', true],
      ],
    ],
    [
      '切换分组',
      [
        [19, 'number', 150],
        [20, 'check', false],
        [21, 'check', false],
      ],
    ],
    [
      '唤醒',
      [
        [22, 'text', 'Alt + Space'],
        [23, 'text', 'Ctrl + Alt + Space'],
        [
          24,
          'select',
          '空格键',
          ['空格键', 'TAB键', '回车键', '左 Ctrl 键', '右 Ctrl 键', '左 SHIFT 键', '左 Alt 键', '左 Windows 键'],
        ],
        [25, 'check', false],
        [26, 'select', '全局', ['全局', '任务栏', '桌面']],
        [27, 'select', '单击', ['单击', '双击']],
        [28, 'select', '中键', ['中键', '左键', '右键', '侧键前', '侧键后']],
        [29, 'check', false],
        [30, 'number', 150],
        [31, 'check', true],
        [32, 'check', true],
        [52, 'check', false],
      ],
    ],
    [
      '隐藏',
      [
        [34, 'check', false],
        [35, 'check', true],
        [36, 'check', true],
        [37, 'check', true],
        [38, 'check', true],
        [75, 'check', true],
        [74, 'check', true],
        [76, 'select', '保留搜索', ['保留搜索', '清空搜索', '关闭搜索页']],
        [80, 'check', true],
      ],
    ],
    [
      '鼠标手势',
      [
        ['启用鼠标手势', 'check', false],
        ['显示操作提示', 'check', true],
        ['激活手势执行窗口', 'check', false],
        ['忽略键', 'text', 'Ctrl'],
        ['最小启动距离', 'number', 12],
        ['轨迹宽度', 'number', 3],
        ['轨迹颜色', 'color', '#7194df'],
        ['提示背景颜色', 'color', '#ffffff'],
        ['提示文本颜色', 'color', '#5e6f91'],
      ],
    ],
  ],
  界面: [
    [
      '主题',
      [
        ['主题', 'select', '白色 · 蓝灰', Object.keys(THEME_ACCENTS)],
        [54, 'check', false],
      ],
    ],
    [
      '窗口',
      [
        [39, 'check', false],
        [40, 'check', false],
        [41, 'check', false],
        [42, 'text', '工具箱'],
        ['界面字体', 'font', 'Segoe UI'],
        ['窗口圆角', 'number', 6],
        [61, 'text', ''],
        [62, 'select', '等比缩放', ['居中缩放', '等比缩放', '缩放', '平铺', '不重复']],
        [63, 'range', 0],
      ],
    ],
    [
      '标题栏按钮',
      [
        [64, 'check', true],
        [65, 'check', true],
        [66, 'check', true],
        [67, 'check', true],
      ],
    ],
    [
      '默认布局',
      [
        [43, 'select', '左侧', ['左侧', '右侧', '顶部', '底部', '不显示']],
        [44, 'select', '居中', ['居中', '左侧', '右侧']],
        [45, 'select', '列表', ['图标', '列表', '平铺']],
        [46, 'select', '小图标', ['小图标', '中等图标', '大图标']],
        [47, 'select', '一行', ['不显示名称', '一行', '两行', '三行']],
        [68, 'check', false],
      ],
    ],
    [
      '提示组件',
      [
        ['启用提示组件', 'check', true],
        ['打开次数', 'check', true],
        ['路径', 'check', true],
        ['参数', 'check', true],
        ['备注', 'check', true],
        ['创建时间', 'check', false],
        ['上次编辑时间', 'check', false],
        ['上次运行时间', 'check', false],
      ],
    ],
  ],
  搜索: [
    [
      '匹配方式',
      [
        [48, 'check', true],
        [49, 'check', true],
        [50, 'check', true],
        [81, 'check', false],
        [77, 'check', true],
        [78, 'number', 200],
        [79, 'check', true],
      ],
    ],
    [
      '搜索范围',
      [
        ['名称', 'check', true],
        ['目标', 'check', true],
        ['搜索关键词', 'check', true],
        ['备注', 'check', true],
        ['虚拟文件夹', 'check', true],
      ],
    ],
    [
      '加权',
      [
        [72, 'number', 10],
        ['打开次数权重', 'number', 5],
      ],
    ],
    ['降权', [[73, 'number', 10]]],
  ],
};

const VIEW_BY_NAME: Record<string, 'icons' | 'list' | 'tiles'> = {
  图标: 'icons',
  列表: 'list',
  平铺: 'tiles',
};

let settingsTab = '常规';

function settingsSpec(spec: Spec): HTMLElement {
  const [key, type, fallback, options] = spec;
  const label = settingLabel(key);
  if (store.state.values[label] === undefined) store.setValue(label, fallback);

  // 快捷键点一下就开始按键，避免输入框里手打 "Ctrl + Alt + K" 这种格式。
  if (label === '全局快捷键' || label === '搜索快捷键') {
    return hotkeyField(label, String(store.state.values[label] ?? fallback), (value) =>
      store.setValue(label, value),
    );
  }

  // 界面字体：可手输，也可从系统已安装字体里挑。
  if (label === '界面字体') {
    return fontField(label, String(store.state.values[label] ?? fallback), (value) =>
      store.setValue(label, value),
    );
  }

  // 工具根目录用「浏览」挑目录，避免手输错路径导致所有 %cmacckkTools% 项目失效。
  if (label === '工具根目录') {
    const wrap = fieldButtons(
      label,
      String(store.state.values[label] ?? DEFAULT_TOOLS_ROOT),
      [
        [
          '浏览',
          () => {
            void pickDirectory('选择工具根目录').then((path) => {
              if (!path) return;
              store.setValue(label, path);
              const input = wrap.querySelector('input');
              if (input) input.value = path;
              toast('已设置工具根目录');
            });
          },
          'folder-open',
        ],
      ],
      (value) => store.setValue(label, value),
    );
    return wrap;
  }

  // 背景图片要挑本地文件，路径只读展示，避免手输半截路径触发读图失败。
  if (label === '背景图片') {
    const wrap = fieldButtons(
      label,
      String(store.state.values[label] ?? ''),
      [
        ['选择图片', () => void chooseBackground(), 'image'],
        ['清除', () => clearBackground(), 'x'],
      ],
      (value) => store.setValue(label, value),
    );
    const input = wrap.querySelector('input');
    if (input) {
      input.readOnly = true;
      input.placeholder = '未选择图片';
    }
    return wrap;
  }

  return field(label, type, store.state.values[label], options ?? [], (value) => {
    store.update((draft) => {
      draft.values[label] = value;
      if (label === '窗口圆角') {
        draft.radius = Math.min(14, Math.max(0, Number(value)));
      }
      if (label === '主题') {
        draft.accent = THEME_ACCENTS[String(value)] ?? draft.accent;
      }
      if (label === '项目显示类型') {
        draft.view = VIEW_BY_NAME[String(value)] ?? draft.view;
      }
    });
    // 开机启动会写 HKCU 的 Run 项，属于系统副作用，单独处理。
    if (label === '开机启动') void setAutostart(Boolean(value));
  });
}

function renderPlugins(content: HTMLElement, ctx: PanelContext): void {
  content.append(E('h3', 'mn-subtitle', '已安装的扩展'));
  for (const [name, desc] of Object.entries(PLUGIN_DESCRIPTIONS)) {
    const enabled = Boolean(store.state.values[`plugin.${name}`] ?? DEFAULT_PLUGINS[name]);
    const card = E('section', 'mn-plugin');
    const head = E('div', 'mn-pluginhead');
    head.append(E('strong', '', name));
    const actions = E('div', 'mn-inline');
    actions.append(
      check(`启用 ${name}`, enabled, (checked) => {
        store.setValue(`plugin.${name}`, checked);
      }),
      B(
        '',
        () =>
          ctx.open('plugin', {
            name,
          }),
        'mn-iconbutton',
        'ellipsis',
      ),
    );
    head.append(actions);
    const tags = E('div', 'mn-tags');
    const tagList = ['V', 'SO', ...(name === 'Calc' ? ['Global', 'Regex'] : []), `Key: ${name === 'Cmd' ? 4 : 1}`];
    for (const tag of tagList) tags.append(E('span', '', tag));
    card.append(head, tags, E('div', 'mn-plugindesc', desc));
    const meta = E('div', 'mn-pluginmeta');
    meta.append(
      E('span', '', 'Author: N25H · Version: 1.0.0.1'),
      E('span', '', `ID: mn.cc.arae.${name.toLowerCase()}`),
    );
    card.append(meta);
    content.append(card);
  }
  content.append(B('安装扩展', () => ctx.open('installplugin'), 'mn-btn', 'package-plus'));
}

function renderAbout(content: HTMLElement, ctx: PanelContext): void {
  const about = E('div', 'mn-about');
  about.append(
    E('h3', '', '工具箱'),
    E('p', '', '轻量、紧凑的桌面启动面板'),
    E('p', '', 'CLI 使用终端图标，GUI 使用窗口图标。'),
  );
  content.append(
    about,
    E('div', 'mn-divider'),
    field('功能状态', 'text', '本地配置 · 托盘常驻 · 全局热键'),
    E('p', 'mn-note', '配置保存在 %AppData%\QiBox，修改后立即写盘；不会修改系统设置或别的软件的数据。'),
  );
  const row = E('div', 'mn-inline');
  row.append(
    B('构建信息', () => ctx.open('build')),
    B('检查更新', () => ctx.open('update')),
    B('项目主页', () => ctx.open('sources')),
  );
  content.append(row);
}

function renderHelp(content: HTMLElement, ctx: PanelContext): void {
  content.append(E('h3', 'mn-subtitle', '帮助'));
  const help = E('div', 'mn-help');
  const sections: Array<[string, string]> = [
    ['主窗口与搜索', '点击标题栏搜索图标进入搜索页。直接输入关键词查找项目；Esc 返回主界面。'],
    [
      '项目管理',
      '右键项目可编辑、复制、移动、查看属性和删除。右键空白处可新建项目、切换视图及排序。',
    ],
    [
      '分类与虚拟文件夹',
      '右键左侧分类可重命名、设置密码、调整视图或删除。虚拟文件夹通过项目中的文件夹图标进入。',
    ],
    ['键盘操作', 'Ctrl+K 或 Ctrl+F 搜索；F2 编辑选中项目；F4 设置；Shift+F10 打开项目菜单；Esc 关闭当前菜单或面板。'],
    ['脚本与扩展', 'Script 项目提供代码编辑界面；搜索扩展在设置的插件页管理。当前版本不会执行脚本或插件。'],
    [
      '任务计划',
      '任务计划提供定时、开机启动和每次启动的配置界面。定时表达式可在编辑器中选择秒、分、时、日、月、周、年。',
    ],
  ];
  for (const [title, text] of sections) {
    const details = E('details');
    details.append(E('summary', '', title), E('p', '', text));
    help.append(details);
  }
  content.append(
    help,
    E('div', 'mn-divider'),
    B('参数变量', () => ctx.open('variables'), 'mn-btn', 'braces'),
    B('参考来源', () => ctx.open('sources'), 'mn-btn', 'book-open'),
  );
}

export const settingsPanel = {
  title: '设置',
  size: 'large' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('设置');
    body.classList.add('flush');

    const layout = E('div', 'mn-settings');
    const nav = E('nav', 'mn-settings-nav');
    const content = E('div', 'mn-settings-body');
    nav.setAttribute('aria-label', '设置分类');

    for (const name of ['关于', '常规', '动作', '界面', '搜索', '插件', '帮助']) {
      nav.append(
        B(
          name,
          () => {
            settingsTab = name;
            ctx.refresh();
          },
          name === settingsTab ? 'active' : '',
        ),
      );
    }
    layout.append(nav, content);
    body.append(layout);

    footer?.append(
      B('恢复默认', () => {
        const groups = SETS[settingsTab];
        if (!groups) {
          toast('当前页没有可恢复的设置');
          return;
        }
        store.update((draft) => {
          for (const [, specs] of groups) {
            for (const [key, , fallback] of specs) draft.values[settingLabel(key)] = fallback;
          }
        });
        ctx.refresh();
        toast('已恢复当前页的演示设置');
      }),
      B('关闭', () => ctx.close(), 'mn-btn primary'),
    );

    const groups = SETS[settingsTab];
    if (groups) {
      for (const [title, specs] of groups) {
        const section = E('section', 'mn-settingsection');
        section.append(E('h3', '', title));
        for (const spec of specs) section.append(settingsSpec(spec));
        if (title === '主题') section.append(B('主题编辑器', () => ctx.open('theme'), 'mn-btn', 'palette'));
        if (title === '鼠标手势') {
          section.append(B('管理手势', () => ctx.open('gestures'), 'mn-btn', 'mouse-pointer-2'));
        }
        content.append(section);
      }
    } else if (settingsTab === '插件') {
      renderPlugins(content, ctx);
    } else if (settingsTab === '关于') {
      renderAbout(content, ctx);
    } else {
      renderHelp(content, ctx);
    }

    // 语言表中的其它文案由各面板按需取用，这里保留引用避免 tree-shaking 误删。
    void L;
    icons();
  },
};
