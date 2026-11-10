import type { SettingValue } from '../domain/types';
import { listFonts } from '../services/desktop';
import { B, E } from './dom';

export type FieldType =
  | 'text'
  | 'number'
  | 'check'
  | 'select'
  | 'textarea'
  | 'color'
  | 'range'
  | 'password'
  | 'font'
  | 'hotkey';


const HOTKEY_KEYS: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
};

function hotkeyKeyName(event: KeyboardEvent): string | null {
  if (event.key in HOTKEY_KEYS) return HOTKEY_KEYS[event.key];
  if (/^F\d{1,2}$/.test(event.key)) return event.key;
  if (event.key.length === 1) return event.key.toUpperCase();
  if (['Enter', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
    return event.key;
  }
  return null;
}

/** 点一下就开始按键：Ctrl/Alt/Shift/Win + 任意键，Esc 取消，Delete 清空。 */
export function hotkeyField(
  label: string,
  value: string,
  onchange: (next: string) => void,
): HTMLLabelElement {
  const wrap = E('label', 'mn-field');
  wrap.append(E('span', '', label));
  const input = E('input');
  input.type = 'text';
  input.readOnly = true;
  input.value = value;
  input.placeholder = '点击后按下组合键';
  input.setAttribute('aria-label', `${label}，点击后按下组合键`);

  let capturing = false;
  let previous = value;

  const finish = (next: string): void => {
    capturing = false;
    input.classList.remove('capturing');
    input.value = next;
    if (next !== previous) {
      previous = next;
      onchange(next);
    }
  };

  input.addEventListener('click', () => {
    if (capturing) return;
    capturing = true;
    previous = input.value;
    input.value = '请按下组合键…';
    input.classList.add('capturing');
  });

  input.addEventListener('keydown', (event) => {
    if (!capturing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      finish(previous);
      input.blur();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      finish('');
      input.blur();
      return;
    }
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Win');
    const name = hotkeyKeyName(event);
    if (!name) {
      input.value = [...parts, '…'].join(' + ');
      return;
    }
    if (parts.length === 0) {
      input.value = '需要至少一个修饰键（Ctrl / Alt / Shift / Win）';
      return;
    }
    finish([...parts, name].join(' + '));
    input.blur();
  });

  input.addEventListener('blur', () => {
    if (!capturing) return;
    capturing = false;
    input.classList.remove('capturing');
    input.value = previous;
  });

  wrap.append(input);
  return wrap;
}

let fontList: HTMLDataListElement | null = null;

function ensureFontList(): HTMLDataListElement {
  if (fontList && fontList.isConnected) return fontList;
  fontList = document.createElement('datalist');
  fontList.id = 'qibox-font-list';
  document.body.append(fontList);
  void listFonts().then((names) => {
    if (!fontList) return;
    for (const name of names) {
      const option = document.createElement('option');
      option.value = name;
      fontList.append(option);
    }
  });
  return fontList;
}

/** 字体输入框：可以手输，也可以从系统已安装字体里挑。 */
export function fontField(
  label: string,
  value: string,
  onchange: (next: string) => void,
): HTMLLabelElement {
  const wrap = E('label', 'mn-field');
  wrap.append(E('span', '', label));
  const input = E('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = '输入或选择字体名称';
  input.setAttribute('list', ensureFontList().id);
  input.addEventListener('change', () => onchange(input.value.trim()));
  wrap.append(input);
  return wrap;
}

export type FieldButton = [text: string, onClick: () => void, icon?: string];

/** 表单项：标签 + 控件，控件值变化时回调最新值。 */
export function field(
  label: string,
  type: FieldType = 'text',
  value: SettingValue = '',
  options: string[] = [],
  onchange?: (value: SettingValue) => void,
): HTMLLabelElement {
  const wrap = E('label', 'mn-field');

  if (type === 'check') {
    const box = E('span', 'mn-check');
    const input = E('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => onchange?.(input.checked));
    box.append(input);
    wrap.append(E('span', '', label), box);
    return wrap;
  }

  wrap.append(E('span', '', label));

  if (type === 'select') {
    const select = E('select');
    for (const option of options) {
      const node = E('option', '', option);
      node.value = option;
      select.append(node);
    }
    select.value = String(value || options[0] || '');
    select.setAttribute('aria-label', label);
    select.addEventListener('change', () => onchange?.(select.value));
    wrap.append(select);
    return wrap;
  }

  if (type === 'textarea') {
    const area = E('textarea');
    area.value = String(value ?? '');
    area.setAttribute('aria-label', label);
    area.addEventListener('input', () => onchange?.(area.value));
    wrap.append(area);
    return wrap;
  }

  const input = E('input');
  input.type = type;
  input.value = String(value ?? '');
  if (type === 'number' || type === 'range') input.min = '0';
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => {
    onchange?.(type === 'number' || type === 'range' ? Number(input.value) : input.value);
  });
  wrap.append(input);
  return wrap;
}

/** 纯复选框（文字在右侧），用于卡片内联开关。 */
export function check(
  label: string,
  value: boolean,
  onchange?: (checked: boolean) => void,
): HTMLLabelElement {
  const node = E('label', 'mn-check');
  const input = E('input');
  input.type = 'checkbox';
  input.checked = value;
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => onchange?.(input.checked));
  node.append(input, document.createTextNode(label));
  return node;
}

/** 文本框 + 行内按钮组（浏览、按键、编辑等）。 */
export function fieldButtons(
  label: string,
  value: string,
  buttons: FieldButton[],
  onchange?: (value: string) => void,
): HTMLLabelElement {
  const wrap = field(label, 'text', value, [], (next) => onchange?.(String(next)));
  const input = wrap.querySelector('input');
  const inline = E('span', 'mn-inline');
  if (input) {
    input.remove();
    inline.append(input);
  }
  for (const [text, onClick, icon] of buttons) {
    inline.append(B(text, onClick, 'mn-btn', icon));
  }
  wrap.append(inline);
  return wrap;
}

export function tabs(names: string[], current: string, onPick: (name: string) => void): HTMLElement {
  const bar = E('div', 'mn-tabs');
  bar.setAttribute('role', 'tablist');
  for (const name of names) {
    const button = B(name, () => onPick(name), '');
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(name === current));
    bar.append(button);
  }
  return bar;
}

export type Cell = string | Node;

export function table(headers: string[], rows: Cell[][]): HTMLElement {
  const wrap = E('div', 'mn-tablewrap');
  const tbl = E('table', 'mn-table');
  const head = E('thead');
  const headRow = E('tr');
  for (const header of headers) headRow.append(E('th', '', header));
  head.append(headRow);
  tbl.append(head);
  const body = E('tbody');
  for (const row of rows) {
    const tr = E('tr');
    for (const cell of row) {
      const td = E('td');
      if (cell instanceof Node) td.append(cell);
      else td.textContent = cell;
      tr.append(td);
    }
    body.append(tr);
  }
  tbl.append(body);
  wrap.append(tbl);
  return wrap;
}
