/**
 * 领域类型：界面只依赖这些结构，未来接入真实数据源时替换 store 的装载层即可。
 */

/** 项目类型。REGULAR 只出现在编辑器的“项目类型”下拉里，落库时转成 CLI / GUI。 */
export type ItemKind =
  | 'CLI'
  | 'GUI'
  | 'FOLDER'
  | 'URL'
  | 'SCRIPT'
  | 'TITLE'
  | 'SPACER'
  | 'BUILTIN'
  | 'APPX'
  | 'REGULAR';

export interface ToolItem {
  id: number;
  name: string;
  type: ItemKind;
  group: string;
  category: string;
  /** 所属虚拟文件夹名称，空串表示在分类根层。 */
  parent: string;
  target: string;
  args: string;
  start: string;
  remark: string;
  hotkey: string;
  keywords: string;
  /** 是否以管理员权限启动。 */
  admin?: boolean;
  /** 自定义 Lucide 图标名；为空时按类型取默认图标。 */
  icon?: string;
  /** 自定义解释器（powershell / python / node …）；为空时按扩展名自动判断。 */
  runner?: string;
  /** 运行环境：本机（默认）或 WSL。 */
  env?: 'local' | 'wsl';
  /** WSL 发行版名称，空串表示默认发行版。 */
  wslDistro?: string;
  /** WSL 内的工作目录（Linux 路径）。 */
  wslCwd?: string;
}

export type ViewMode = 'list' | 'icons' | 'tiles';

/** 设置项的值：文本、数字、布尔、颜色都走同一张表，键就是界面上的中文标签。 */
export type SettingValue = string | number | boolean;
export type SettingMap = Record<string, SettingValue>;

export interface TaskSample {
  name: string;
  mode: string;
  expression: string;
  target: string;
  enabled: boolean;
}

export interface AppState {
  schema: number;
  categories: string[];
  items: ToolItem[];
  favorites: number[];
  tasks: TaskSample[];
  /** 分类口令：分类名 → 口令明文；只存本机配置，不做加密。 */
  passwords: Record<string, string>;
  values: SettingMap;
  view: ViewMode;
  pinned: boolean;
  category: string;
  accent: string;
  radius: number;
  tint: string;
  /** 主窗口尺寸，启动时还原；最大化时不写入。 */
  windowSize: { width: number; height: number };
  /** 主窗口位置（物理像素），启动时还原；空值表示居中。 */
  windowPosition: { x: number; y: number } | null;
}

export type PanelName =
  | 'settings'
  | 'quick'
  | 'script'
  | 'plugins'
  | 'editor'
  | 'builtin'
  | 'category'
  | 'password'
  | 'confirm'
  | 'transfer'
  | 'icon'
  | 'iconpick'
  | 'browse'
  | 'openwith'
  | 'batch'
  | 'hotkeycapture'
  | 'scope'
  | 'variables'
  | 'plugin'
  | 'installplugin'
  | 'schedule'
  | 'taskedit'
  | 'cron'
  | 'manager'
  | 'data'
  | 'import'
  | 'export'
  | 'migrate'
  | 'datapreview'
  | 'hotkeys'
  | 'path'
  | 'theme'
  | 'themesave'
  | 'gestures'
  | 'gestureedit'
  | 'update'
  | 'build'
  | 'sources'
  | 'drop'
  | 'simple';

export interface PanelArg {
  [key: string]: unknown;
}

/** 打开面板窗口的请求体，前端与 Rust 命令共用同一形状。 */
export interface PanelRequest {
  panel: string;
  arg: string;
  width: number;
  height: number;
  title: string;
}
