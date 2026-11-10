import type { ToolItem } from '../domain/types';

/**
 * 参数变量展开。%mp% / %mr% / %so% 在前端展开，
 * 其余 %XXX% 形式的 Windows 环境变量留给 Rust 侧启动时展开。
 */
/** 「工具根目录」的默认值，可在 设置 → 常规 里改。 */
export const DEFAULT_TOOLS_ROOT = 'F:\\MayeLite\\cmacckkTools';

export interface VariableContext {
  /** 程序所在目录，桌面端由 Rust 提供；浏览器预览时保持字面量。 */
  exeDir: string;
  /** 工具根目录，%cmacckkTools% 展开成它。 */
  toolsRoot?: string;
  /** 搜索页当前的搜索词，供 %so% / %so-url% 使用。 */
  search?: string;
  item?: Pick<ToolItem, 'name' | 'target' | 'category' | 'group'>;
}

const PATTERNS: Array<[RegExp, (ctx: VariableContext) => string]> = [
  [/%cmacckktools%/gi, (ctx) => ctx.toolsRoot?.trim() || DEFAULT_TOOLS_ROOT],
  [/%mp%/gi, (ctx) => ctx.exeDir],
  [/%mr%/gi, (ctx) => /^([A-Za-z]:)/.exec(ctx.exeDir)?.[1] ?? ''],
  [/%so-url%/gi, (ctx) => encodeURIComponent(ctx.search ?? '')],
  [/%so%/gi, (ctx) => ctx.search ?? ''],
  [/%name%/gi, (ctx) => ctx.item?.name ?? ''],
  [/%path%/gi, (ctx) => ctx.item?.target ?? ''],
  [/%category%/gi, (ctx) => ctx.item?.category ?? ''],
  [/%group%/gi, (ctx) => ctx.item?.group ?? ''],
];

export function expandVariables(input: string, ctx: VariableContext): string {
  if (!input) return '';
  let out = input;
  for (const [pattern, resolve] of PATTERNS) {
    out = out.replace(pattern, resolve(ctx));
  }
  return out;
}

/** 相对路径按程序目录解析；URL、绝对路径、含变量的路径原样返回。 */
export function resolveTarget(target: string, exeDir: string): string {
  const value = target.trim();
  if (!value) return '';
  if (/^[a-z]+:\/\//i.test(value)) return value;
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) return value;
  if (value.includes('%')) {
    // 变量展开后仍未变成绝对路径时，补上程序目录。
    return /^[A-Za-z]:[\\/]/.test(value) ? value : joinPath(exeDir, value);
  }
  return joinPath(exeDir, value);
}

function joinPath(base: string, relative: string): string {
  if (!base) return relative;
  return `${base.replace(/[\\/]+$/, '')}\\${relative.replace(/^[\\/]+/, '')}`;
}
