import { B, E, icons, toast } from '../dom';
import { check, field, table } from '../fields';
import { panelFrame, type PanelContext } from './context';

interface Gesture {
  id: number;
  enabled: boolean;
  track: string;
  action: string;
}

const GESTURES: Gesture[] = [
  { id: 1, enabled: true, track: '↑', action: '显示主窗口' },
  { id: 2, enabled: true, track: '↓', action: '隐藏主窗口' },
  { id: 3, enabled: false, track: '→ ↓', action: '打开项目' },
];

export const gesturesPanel = {
  title: '鼠标手势',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('鼠标手势', 'medium');
    body.append(
      table(
        ['启用', '轨迹', '操作', '配置'],
        GESTURES.map((gesture) => [
          check(`启用 ${gesture.track} 手势`, gesture.enabled, (checked) => {
            gesture.enabled = checked;
          }),
          gesture.track,
          gesture.action,
          B('编辑', () => ctx.open('gestureedit', { direction: gesture.track })),
        ]),
      ),
    );
    const row = E('div', 'mn-inline');
    row.append(
      B('新建手势', () => ctx.open('gestureedit'), 'mn-btn', 'plus'),
      B('删除', () => toast('演示界面：未删除手势'), 'mn-btn', 'trash-2'),
    );
    body.append(E('div', 'mn-divider'), row, E('p', 'mn-note', '手势界面演示，不监听系统鼠标操作。'));
    footer?.append(B('关闭', () => ctx.close(), 'mn-btn primary'));
    icons();
  },
};

export const gestureEditPanel = {
  title: '编辑鼠标手势',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const direction = typeof ctx.arg.direction === 'string' ? ctx.arg.direction : '↑';
    const { body, footer } = panelFrame('编辑鼠标手势', 'medium');
    body.append(
      E('div', 'mn-gesturepad', direction),
      E('div', 'mn-divider'),
      field('手势轨迹', 'select', direction, ['↑', '↓', '←', '→', '→ ↓', '← ↓', '↑ →', '↓ →']),
      field('操作', 'select', '显示主窗口', ['显示主窗口', '隐藏主窗口', '打开项目', '执行 Script', '切换分类']),
      field('关联项目', 'select', 'Nmap', ['Nmap', 'Windows Terminal', '示例脚本']),
      field('匹配范围', 'select', '全局', ['全局', '任务栏', '桌面']),
      field('忽略键', 'text', 'Ctrl'),
    );
    footer?.append(
      B('取消', () => ctx.close()),
      B('保存', () => {
        ctx.close();
        toast('演示界面：未保存手势配置');
      }, 'mn-btn primary'),
    );
    icons();
  },
};
