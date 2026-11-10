import type { TaskSample, ToolItem } from '../domain/types';

/** 演示分类。真实数据源接入后这一层会被替换，界面不感知。 */
export const CATEGORIES: string[] = [
  '信息收集',
  '漏洞扫描',
  'WebShell',
  'Fake-Listen',
  'Payload',
  'ProxyTool',
  'Crypto',
  'FrameExp',
  'Misc',
  'Reverse',
  '密码爆破',
  '应急响应',
  '连接工具',
  '数据库',
  '提权',
  'C2',
  '综合工具',
  '终端工具',
  '办公',
  '微信小程序',
  '域渗透',
  '凭据导出',
  '云',
  '文档',
  'ATT&CK',
  'AI',
];

type Seed = [name: string, type: ToolItem['type'], group: string, category: string, parent?: string];

const SEEDS: Seed[] = [
  ['Onyx-v1.9.4', 'GUI', '综合工具', '信息收集'],
  ['mitan', 'CLI', '综合工具', '信息收集'],
  ['TscanPlus', 'GUI', '综合工具', '信息收集'],
  ['ENScan', 'CLI', '综合工具', '信息收集'],
  ['OneForAll', 'CLI', '子域名扫描', '信息收集'],
  ['fscan2.0', 'CLI', '主机扫描', '信息收集'],
  ['Nmap', 'CLI', '主机扫描', '信息收集'],
  ['RustScan', 'CLI', '主机扫描', '信息收集'],
  ['Gobuster', 'CLI', '目录扫描', '信息收集'],
  ['dirsearch', 'CLI', '目录扫描', '信息收集'],
  ['ffuf', 'CLI', '目录扫描', '信息收集'],
  ['更多扫描工具', 'FOLDER', '更多', '信息收集'],
  ['Arjun', 'CLI', '参数发现', '信息收集', '更多扫描工具'],
  ['Wfuzz', 'CLI', '参数发现', '信息收集', '更多扫描工具'],
  ['TideFinger', 'CLI', '指纹识别', '信息收集', '更多扫描工具'],
  ['Nuclei', 'CLI', '漏洞扫描', '漏洞扫描'],
  ['AWVS', 'GUI', '漏洞扫描', '漏洞扫描'],
  ['Burp Suite', 'GUI', 'Web 测试', 'WebShell'],
  ['ProxyTool', 'GUI', '代理', 'ProxyTool'],
  ['Proxifier', 'GUI', '代理', '连接工具'],
  ['CyberChef', 'GUI', '编码工具', 'Crypto'],
  ['Ghidra', 'GUI', '静态分析', 'Reverse'],
  ['Detect It Easy', 'GUI', '静态分析', 'Reverse'],
  ['Autoruns', 'GUI', '系统排查', '应急响应'],
  ['Process Explorer', 'GUI', '系统排查', '应急响应'],
  ['Windows Terminal', 'GUI', '终端', '终端工具'],
  ['命令提示符', 'BUILTIN', '终端', '终端工具'],
  ['Git', 'CLI', '开发', '终端工具'],
  ['Obsidian', 'GUI', '笔记', '办公'],
  ['Pandoc', 'CLI', '文档', '文档'],
  ['官方文档', 'URL', '链接', '文档'],
  ['示例脚本', 'SCRIPT', 'Script', '综合工具'],
  ['常用工具', 'TITLE', '标题', '综合工具'],
  ['空白占位', 'SPACER', '占位', '综合工具'],
];

export function seedItems(): ToolItem[] {
  return SEEDS.map(([name, type, group, category, parent = ''], id) => ({
    id,
    name,
    type,
    group,
    category,
    parent,
    target: type === 'URL' ? 'https://example.com' : `%mp%\\Tools\\${name}\\${name}.exe`,
    args: '',
    start: '%mp%\\Tools',
    remark: '',
    hotkey: '',
    keywords: name.toLowerCase(),
  }));
}

export const DEFAULT_VALUES: Record<string, string | number | boolean> = {
  语言: '简体中文',
  窗口标题: '工具箱',
  界面字体: 'Segoe UI',
  主题: '白色 · 蓝灰',
  窗口圆角: 6,
  分类显示位置: '左侧',
  分类名对齐方式: '居中',
  项目显示类型: '列表',
  项目图标尺寸: '小图标',
  项目名称显示行数: '一行',
  自动备份: 10,
  全局快捷键: 'Alt + Space',
  搜索快捷键: 'Ctrl + Alt + Space',
};

export const DEFAULT_FAVORITES = [0, 6];

export const DEFAULT_PLUGINS: Record<string, boolean> = {
  Calc: true,
  Cmd: true,
  Run: true,
  Hash: true,
  Rand: true,
  Demo: false,
};

export const PLUGIN_DESCRIPTIONS: Record<string, string> = {
  Calc: '计算数学公式（例如 5*3-2）',
  Cmd: '执行 Cmd 命令（例如 ping、tasklist）',
  Run: '根据输入的名称，打开相应程序',
  Hash: '计算哈希并生成值',
  Rand: '随机数据生成',
  Demo: '搜索扩展示例',
};

export function defaultTasks(): TaskSample[] {
  return [
    { name: '示例 · 打开工作环境', mode: '每次启动', expression: '—', target: 'Windows Terminal', enabled: true },
    { name: '示例 · 整理工作目录', mode: '定时', expression: '0 0 9 * * ?', target: '示例脚本', enabled: false },
  ];
}

/** 内置项目图标对应关系（键来自语言表的 BI_ 前缀）。 */
export const BUILTIN_ICONS: Record<string, string> = {
  BI_shutdown: 'power',
  BI_reboot: 'rotate-cw',
  BI_dormancy: 'moon',
  BI_sleep: 'moon-star',
  BI_cancellation: 'log-out',
  BI_lockscreen: 'lock-keyhole',
  BI_closescreen: 'monitor-off',
  BI_disableCloseScreen: 'lightbulb',
  BI_enableCloseScreen: 'lightbulb-off',
  BI_volumeUp: 'volume-2',
  BI_volumeDown: 'volume-1',
  BI_volumeMute: 'volume-x',
  BI_mediaLast: 'skip-back',
  BI_mediaPlay: 'play',
  BI_mediaNext: 'skip-forward',
  BI_computer: 'monitor',
  BI_recycle: 'trash-2',
  BI_controls: 'sliders-horizontal',
  BI_connections: 'network',
  BI_network: 'globe',
  BI_printers: 'printer',
  BI_startup: 'folder-up',
  BI_altstartup: 'folder-up',
  BI_ComSpec: 'square-terminal',
  BI_calc: 'calculator',
  BI_mspaint: 'palette',
  BI_notepad: 'notebook',
  BI_mstsc: 'monitor-up',
  BI_SndVol: 'volume-2',
  BI_regedit: 'database',
  BI_gpedit: 'settings-2',
  BI_services: 'settings',
  BI_perfmon: 'activity',
  BI_devmgmt: 'cpu',
  BI_compmgmt: 'monitor-cog',
  BI_certmgr: 'badge-check',
  BI_certlm: 'shield-check',
  BI_appwiz: 'package',
  BI_optionalfeatures: 'blocks',
  BI_godmode: 'command',
  BI_envar: 'braces',
  BI_taskschd: 'calendar-clock',
  BI_secpol: 'shield',
  BI_eventvwr: 'logs',
  BI_msconfig: 'settings',
};

export const THEME_ACCENTS: Record<string, string> = {
  '白色 · 蓝灰': '#516fd1',
  '白色 · 灰绿': '#568772',
  '白色 · 中性灰': '#7c8492',
  '深色 · 蓝灰': '#7d9bff',
  '深色 · 中性灰': '#9aa3b2',
};

/** 需要切到暗色底的主题名。 */
export const DARK_THEMES: ReadonlySet<string> = new Set(['深色 · 蓝灰', '深色 · 中性灰']);
