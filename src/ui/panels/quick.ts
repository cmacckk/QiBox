import type { SettingValue, ViewMode } from '../../domain/types';
import { store } from '../../state/store';
import { setAlwaysOnTop } from '../../services/desktop';
import { B, icons } from '../dom';
import { check, field } from '../fields';
import { panelFrame, type PanelContext } from './context';

const VIEW_BY_LABEL: Record<string, ViewMode> = {
  列表: 'list',
  图标: 'icons',
  平铺: 'tiles',
};

/** 快速设置：把「设置 → 常规/界面/动作」里最常改的几项抽到一页。 */
export const quickPanel = {
  title: '快速设置',
  size: 'small' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('快速设置', 'small');
    const value = (label: string): SettingValue => store.state.values[label] ?? '';
    const set = (label: string, next: SettingValue): void => {
      store.setValue(label, next);
    };

    body.append(
      check('置于顶层', Boolean(value('置于顶层')), (checked) => {
        set('置于顶层', checked);
        void setAlwaysOnTop(checked);
      }),
      check('双击运行项目', Boolean(value('双击运行项目')), (checked) => set('双击运行项目', checked)),
      check('开机启动', Boolean(value('开机启动')), (checked) => set('开机启动', checked)),
      field(
        '项目显示类型',
        'select',
        String(value('项目显示类型') || '列表'),
        ['列表', '图标', '平铺'],
        (next) => {
          set('项目显示类型', next);
          store.update((draft) => {
            draft.view = VIEW_BY_LABEL[String(next)] ?? 'list';
          });
        },
      ),
      field(
        '项目图标尺寸',
        'select',
        String(value('项目图标尺寸') || '小图标'),
        ['小图标', '中图标', '大图标'],
        (next) => set('项目图标尺寸', next),
      ),
      field(
        '分类显示位置',
        'select',
        String(value('分类显示位置') || '左侧'),
        ['左侧', '右侧', '顶部', '底部', '隐藏'],
        (next) => set('分类显示位置', next),
      ),
      field(
        '关闭按钮执行动作',
        'select',
        String(value('关闭按钮执行动作') || '隐藏'),
        ['隐藏', '退出'],
        (next) => set('关闭按钮执行动作', next),
      ),
    );

    footer?.append(
      B('设置', () => ctx.open('settings'), 'mn-btn', 'settings'),
      B('主题', () => ctx.open('theme'), 'mn-btn', 'palette'),
      B('关闭', () => ctx.close(), 'mn-btn primary'),
    );
    icons();
  },
};
