import type { ToolItem } from '../domain/types';
import { store } from '../state/store';

/**
 * 拖动排序。只负责手势与插入位置，真正的落库交给 moveItem / moveCategory。
 * 外部文件拖放仍由 main-window 的 dragenter/drop 处理，两者互不干扰。
 */

const THRESHOLD = 4;
const CLICK_GUARD_MS = 400;

let guardUntil = 0;

/** 拖动刚结束时浏览器还会补一次 click，用它把这次 click 吃掉。 */
export function consumeReorderClick(): boolean {
  if (Date.now() >= guardUntil) return false;
  guardUntil = 0;
  return true;
}

function normalizeGroup(group: string | undefined): string {
  return group ?? '';
}

/** 把项目插到目标分类/分组中的指定锚点前后，并把排序方式记为自定义。 */
export function moveItem(
  itemId: number,
  target: {
    category: string;
    parent: string;
    group: string;
    anchorId: number | null;
    position: 'before' | 'after';
  },
): void {
  store.update((state) => {
    const from = state.items.findIndex((item) => item.id === itemId);
    if (from < 0) return;
    const [item] = state.items.splice(from, 1);
    item.category = target.category;
    item.parent = target.parent;
    item.group = normalizeGroup(target.group);

    let insertAt = -1;
    if (target.anchorId !== null) {
      insertAt = state.items.findIndex((entry) => entry.id === target.anchorId);
    }
    if (insertAt < 0) {
      // 没有锚点就落到目标分类的末尾，避免跑到别的分类顺序里去。
      let last = -1;
      state.items.forEach((entry, index) => {
        if (entry.category === target.category && entry.parent === target.parent) last = index;
      });
      insertAt = last < 0 ? state.items.length : last + 1;
    } else if (target.position === 'after') {
      insertAt += 1;
    }
    state.items.splice(insertAt, 0, item);
    state.values['项目排序方式'] = '自定义顺序';
  });
}

export function moveCategory(from: number, to: number): void {
  store.update((state) => {
    if (from < 0 || from >= state.categories.length) return;
    const [name] = state.categories.splice(from, 1);
    const index = Math.max(0, Math.min(to, state.categories.length));
    state.categories.splice(index, 0, name);
  });
}

interface DragState {
  startX: number;
  startY: number;
  moved: boolean;
  pointerId: number;
  cleanup: () => void;
}

function beginDrag(
  event: PointerEvent,
  options: {
    onStart: () => void;
    onMove: (event: PointerEvent) => void;
    onEnd: (moved: boolean) => void;
  },
): DragState {
  const state: DragState = {
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    pointerId: event.pointerId,
    cleanup: () => undefined,
  };

  const onMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== state.pointerId) return;
    if (!state.moved) {
      const distance = Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY);
      if (distance < THRESHOLD) return;
      state.moved = true;
      options.onStart();
    }
    moveEvent.preventDefault();
    options.onMove(moveEvent);
  };

  const finish = (moved: boolean) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    document.body.classList.remove('mn-reordering');
    options.onEnd(moved);
    state.cleanup();
  };

  const onUp = () => finish(state.moved);
  const onCancel = () => finish(false);
  const onKey = (keyEvent: KeyboardEvent) => {
    if (keyEvent.key === 'Escape') finish(false);
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);
  state.cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
  };
  return state;
}

function clearMarks(container: ParentNode): void {
  for (const node of container.querySelectorAll('.drop-before, .drop-after, .drop-target')) {
    node.classList.remove('drop-before', 'drop-after', 'drop-target');
  }
}

function scrollListNear(list: HTMLElement, clientY: number): void {
  const scroller = list.closest<HTMLElement>('.mn-items');
  if (!scroller) return;
  const rect = scroller.getBoundingClientRect();
  if (clientY < rect.top + 26) scroller.scrollTop -= 12;
  else if (clientY > rect.bottom - 26) scroller.scrollTop += 12;
}

function bindItemDrag(list: HTMLElement, nav: HTMLElement): void {
  list.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const origin = event.target as HTMLElement;
    if (origin.closest('.mn-favorite, .mn-batchcheck')) return;
    const row = origin.closest<HTMLElement>('.mn-item');
    if (!row || !list.contains(row) || !row.dataset.itemId) return;

    const itemId = Number(row.dataset.itemId);
    let rowTarget: { row: HTMLElement; position: 'before' | 'after'; group: string } | null = null;
    let categoryTarget: HTMLElement | null = null;
    let dragging = false;

    beginDrag(event, {
      onStart: () => {
        dragging = true;
        row.classList.add('dragging');
        document.body.classList.add('mn-reordering');
      },
      onMove: (moveEvent) => {
        const { clientX, clientY } = moveEvent;
        scrollListNear(list, clientY);
        clearMarks(list);
        clearMarks(nav);
        rowTarget = null;
        categoryTarget = null;

        const under = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
        const category = under?.closest<HTMLElement>('.mn-category') ?? null;
        if (category && nav.contains(category)) {
          categoryTarget = category;
          category.classList.add('drop-target');
          return;
        }

        const hit = under?.closest<HTMLElement>('.mn-item') ?? null;
        if (!hit || !list.contains(hit) || hit === row || !hit.dataset.itemId) return;
        const rect = hit.getBoundingClientRect();
        const position: 'before' | 'after' = clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        hit.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
        rowTarget = { row: hit, position, group: hit.dataset.group ?? '' };
      },
      onEnd: (moved) => {
        row.classList.remove('dragging');
        clearMarks(list);
        clearMarks(nav);
        if (!moved || !dragging) return;
        guardUntil = Date.now() + CLICK_GUARD_MS;
        if (categoryTarget) {
          const categoryName = categoryTarget.textContent?.trim() ?? '';
          if (categoryName && categoryName !== store.state.category) {
            moveItem(itemId, {
              category: categoryName,
              parent: '',
              group: '',
              anchorId: null,
              position: 'after',
            });
          }
          return;
        }
        if (rowTarget) {
          const parent = store.state.items.find((item) => item.id === itemId)?.parent ?? '';
          moveItem(itemId, {
            category: store.state.category,
            parent,
            group: rowTarget.group,
            anchorId: Number(rowTarget.row.dataset.itemId),
            position: rowTarget.position,
          });
        }
      },
    });
  });
}

function bindCategoryDrag(nav: HTMLElement): void {
  nav.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const button = (event.target as HTMLElement).closest<HTMLElement>('.mn-category');
    if (!button || !nav.contains(button)) return;
    const startIndex = [...nav.querySelectorAll('.mn-category')].indexOf(button);
    if (startIndex < 0) return;
    let targetIndex = startIndex;
    let dragging = false;
    const horizontal = (() => {
      const buttons = [...nav.querySelectorAll('.mn-category')] as HTMLElement[];
      if (buttons.length < 2) return false;
      return Math.abs(buttons[1].offsetTop - buttons[0].offsetTop) < 4;
    })();

    beginDrag(event, {
      onStart: () => {
        dragging = true;
        button.classList.add('dragging');
        document.body.classList.add('mn-reordering');
      },
      onMove: (moveEvent) => {
        clearMarks(nav);
        const buttons = [...nav.querySelectorAll<HTMLElement>('.mn-category')];
        const position = horizontal ? moveEvent.clientX : moveEvent.clientY;
        targetIndex = buttons.length;
        buttons.forEach((entry, index) => {
          const rect = entry.getBoundingClientRect();
          const center = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
          if (position < center) {
            targetIndex = Math.min(targetIndex, index);
            entry.classList.add('drop-before');
          }
        });
      },
      onEnd: (moved) => {
        button.classList.remove('dragging');
        clearMarks(nav);
        if (!moved || !dragging) return;
        guardUntil = Date.now() + CLICK_GUARD_MS;
        const to = targetIndex > startIndex ? targetIndex - 1 : targetIndex;
        if (to !== startIndex) moveCategory(startIndex, to);
      },
    });
  });
}

export function bindReorder(list: HTMLElement, nav: HTMLElement): void {
  bindItemDrag(list, nav);
  bindCategoryDrag(nav);
}

/** 供右键菜单的「自定义顺序」提示用。 */
export function isCustomOrder(): boolean {
  return store.state.values['项目排序方式'] === '自定义顺序';
}

export type { ToolItem };
