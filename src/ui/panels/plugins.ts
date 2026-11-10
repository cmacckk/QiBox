import { store } from '../../state/store';
import { installPlugin, listPlugins, openPluginsDir, removePlugin, type PluginInfo } from '../../services/plugins';
import { isDesktop, pickDirectory } from '../../services/desktop';
import { B, E, icons, toast } from '../dom';
import { check } from '../fields';
import { panelFrame, type PanelContext } from './context';

const MANIFEST_SAMPLE = `{
  "name": "示例插件",
  "version": "1.0.0",
  "description": "在搜索里输入关键词后执行的脚本",
  "entry": "main.js",
  "keywords": "demo,示例"
}`;

export const pluginsPanel = {
  title: '插件管理',
  size: 'medium' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('插件管理', 'medium');
    const listBox = E('div', 'mn-pluginlist');
    body.append(listBox);
    if (footer) footer.textContent = '';

    const renderList = (plugins: PluginInfo[]): void => {
      listBox.textContent = '';
      if (!plugins.length) {
        listBox.append(
          E('p', 'mn-note', '还没有安装插件。插件是一个含 plugin.json 的文件夹，安装后会复制到 %AppData%\\QiBox\\plugins。'),
        );
        return;
      }
      for (const plugin of plugins) {
        const row = E('div', 'mn-pluginrow');
        const head = E('div', 'mn-pluginhead');
        const title = E('div');
        title.append(E('span', 'mn-name', plugin.name));
        if (plugin.version) title.append(E('span', 'mn-note', ` ${plugin.version}`));
        if (plugin.description) title.append(E('div', 'mn-searchdesc', plugin.description));
        const actions = E('div', 'mn-inline');
        actions.append(
          check(
            '启用',
            store.state.values[`plugin.${plugin.name}`] !== false,
            (checked) => {
              store.setValue(`plugin.${plugin.name}`, checked);
            },
          ),
          B('脚本', () => ctx.open('editor', { script: plugin.name }), 'mn-btn', 'scroll-text'),
          B(
            '卸载',
            () =>
              ctx.open('confirm', {
                title: '卸载插件',
                message: `确定卸载插件「${plugin.name}」？只会删除 %AppData%\QiBox\plugins 下的这个文件夹。`,
                onConfirm: () => {
                  void removePlugin(plugin.name)
                    .then(() => {
                      toast(`已卸载「${plugin.name}」`);
                      ctx.refresh();
                    })
                    .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
                },
              }),
            'mn-btn danger',
            'trash-2',
          ),
        );
        head.append(title, actions);
        row.append(head);
        listBox.append(row);
      }
    };

    const refresh = async (): Promise<void> => {
      if (!isDesktop()) {
        listBox.append(E('p', 'mn-note', '浏览器预览看不到本机插件目录。'));
        return;
      }
      try {
        renderList(await listPlugins());
      } catch (error) {
        listBox.append(E('p', 'mn-note', error instanceof Error ? error.message : String(error)));
      }
    };

    const details = E('details', 'mn-note');
    details.append(E('summary', '', 'plugin.json 示例'), E('pre', 'mn-code', MANIFEST_SAMPLE));
    body.append(details);

    footer?.append(
      B('打开插件目录', () => void openPluginsDir(), 'mn-btn', 'folder-open'),
      B(
        '安装插件',
        () => {
          if (!isDesktop()) {
            toast('浏览器预览不能安装插件');
            return;
          }
          void pickDirectory('选择插件文件夹').then(async (dir) => {
            if (!dir) return;
            try {
              const name = await installPlugin(dir);
              toast(`已安装「${name}」`);
              await refresh();
            } catch (error) {
              toast(error instanceof Error ? error.message : String(error));
            }
          });
        },
        'mn-btn',
        'plus',
      ),
      B('关闭', () => ctx.close(), 'mn-btn primary'),
    );
    void refresh();
    icons();
  },
};
