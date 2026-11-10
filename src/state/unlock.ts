/** 分类口令的会话级解锁状态：只存在内存里，重启后重新上锁。 */
import type { AppState } from '../domain/types';

const unlocked = new Set<string>();

export function hasCategoryPassword(state: Pick<AppState, 'passwords'>, category: string): boolean {
  return Boolean(state.passwords?.[category]);
}

export function isCategoryLocked(state: Pick<AppState, 'passwords'>, category: string): boolean {
  return hasCategoryPassword(state, category) && !unlocked.has(category);
}

export function isUnlocked(category: string): boolean {
  return unlocked.has(category);
}

export function unlockCategory(category: string): void {
  unlocked.add(category);
}

export function lockCategory(category: string): void {
  unlocked.delete(category);
}

export function checkPassword(state: Pick<AppState, 'passwords'>, category: string, input: string): boolean {
  return Boolean(state.passwords?.[category]) && state.passwords[category] === input;
}
