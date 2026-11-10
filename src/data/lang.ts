import raw from './lang.json';

/**
 * 语言表来自已确认设计稿（Maye Nano 中文语言文件的界面子集），
 * 只用于界面文案与内置项目命名，不参与任何系统调用。
 */
// SAFETY: 该 JSON 由设计稿语言文件逐键导出，全部键值均为字符串；TypeScript 无法从
// resolveJsonModule 的宽泛推导中得知这一点，故在此一次性收窄，之后不再断言。
export const L = raw as unknown as Record<string, string>;

/** 设置项：数字键映射到 SSTR_010xxx，字符串键直接就是标签。 */
export function settingLabel(key: number | string): string {
  return typeof key === 'number' ? L[`SSTR_010${String(key).padStart(3, '0')}`] ?? `设置项 ${key}` : key;
}

export const builtinEntries = (): Array<[string, string]> =>
  Object.entries(L).filter(([key]) => key.startsWith('BI_')) as Array<[string, string]>;

export const themeGroups = (): string[] =>
  Object.entries(L)
    .filter(([key]) => /^TS_\d{3}$/.test(key))
    .map(([, value]) => value);

export const themeColorRows = (): Array<[string, string]> =>
  Object.entries(L).filter(([key]) => /^TS_\d{5}$/.test(key)) as Array<[string, string]>;
