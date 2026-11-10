import { BUILTIN_ICONS } from '../../data/catalog';
import { builtinEntries } from '../../data/lang';
import type { ToolItem } from '../../domain/types';
import { store } from '../../state/store';
import { B, E, icons, toast } from '../dom';
import { panelFrame, type PanelContext } from './context';

export const builtinPanel = {
  title: '添加内置项目',
  size: 'large' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('添加内置项目');
    body.append(E('p', 'mn-note', '选择需要添加的内置项目'));

    const chosen = new Set<string>();
    const grid = E('div', 'mn-builtin-grid');

    for (const [key, name] of builtinEntries()) {
      const button = B(
        '',
        () => {
          if (chosen.has(name)) chosen.delete(name);
          else chosen.add(name);
          const active = chosen.has(name);
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        },
        'mn-builtin',
      );
      button.setAttribute('aria-label', `选择内置项目 ${name}`);
      button.setAttribute('aria-pressed', 'false');
      const mark = E('span');
      const icon = E('i');
      icon.dataset.lucide = BUILTIN_ICONS[key] ?? 'app-window';
      icon.setAttribute('aria-hidden', 'true');
      mark.append(icon);
      button.append(mark, E('span', '', name));
      grid.append(button);
    }

    body.append(grid);
    footer?.append(
      B('取消', () => ctx.close()),
      B(
        '添加所选项目',
        () => {
          if (!chosen.size) {
            toast('请先选择内置项目');
            return;
          }
          store.update((state) => {
            for (const name of chosen) {
              const item: ToolItem = {
                id: Math.max(0, ...state.items.map((entry) => entry.id)) + 1,
                name,
                type: 'BUILTIN',
                category: state.category,
                parent: '',
                group: '内置项目',
                target: name,
                args: '',
                start: '',
                remark: '',
                hotkey: '',
                keywords: name,
              };
              state.items.push(item);
            }
          });
          ctx.close();
          toast('已写入本地配置');
        },
        'mn-btn primary',
        'plus',
      ),
    );
    icons();
  },
};
