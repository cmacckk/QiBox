import type { PanelArg, PanelName } from '../../domain/types';
import { builtinPanel } from './builtin';
import type { PanelSpec } from './context';
import { dataPanel, dataPreviewPanel, exportPanel, importPanel, migratePanel } from './data';
import { editorPanel } from './editor';
import { gestureEditPanel, gesturesPanel } from './gestures';
import {
  browsePanel,
  buildPanel,
  categoryPanel,
  confirmPanel,
  dropPanel,
  hotkeyCapturePanel,
  hotkeysPanel,
  iconPanel,
  iconPickPanel,
  installPluginPanel,
  batchPanel,
  openWithPanel,
  passwordPanel,
  pathPanel,
  pluginPanel,
  scopePanel,
  simplePanelFactory,
  sourcesPanel,
  transferPanel,
  unknownPanel,
  updatePanel,
  variablesPanel,
} from './misc';
import { quickPanel } from './quick';
import { pluginsPanel } from './plugins';
import { scriptPanel } from './script';
import { settingsPanel } from './settings';
import { cronPanel, managerPanel, schedulePanel, taskEditPanel } from './tasks';
import { themePanel, themeSavePanel } from './theme';

/** 'simple' 的标题由调用方传入，其余面板标题固定或由参数推导。 */
const simplePanel: PanelSpec = {
  ...simplePanelFactory('操作'),
  title: (arg: PanelArg) => (typeof arg.title === 'string' && arg.title ? arg.title : '操作'),
};

const PANELS: Record<PanelName, PanelSpec> = {
  settings: settingsPanel,
  editor: editorPanel,
  builtin: builtinPanel,
  category: categoryPanel,
  password: passwordPanel,
  confirm: confirmPanel,
  transfer: transferPanel,
  icon: iconPanel,
  iconpick: iconPickPanel,
  browse: browsePanel,
  openwith: openWithPanel,
  batch: batchPanel,
  hotkeycapture: hotkeyCapturePanel,
  scope: scopePanel,
  variables: variablesPanel,
  plugin: pluginPanel,
  installplugin: installPluginPanel,
  schedule: schedulePanel,
  taskedit: taskEditPanel,
  cron: cronPanel,
  manager: managerPanel,
  data: dataPanel,
  import: importPanel,
  export: exportPanel,
  migrate: migratePanel,
  datapreview: dataPreviewPanel,
  hotkeys: hotkeysPanel,
  path: pathPanel,
  theme: themePanel,
  themesave: themeSavePanel,
  quick: quickPanel,
  script: scriptPanel,
  plugins: pluginsPanel,
  gestures: gesturesPanel,
  gestureedit: gestureEditPanel,
  update: updatePanel,
  build: buildPanel,
  sources: sourcesPanel,
  drop: dropPanel,
  simple: simplePanel,
};

export { PANEL_SIZES } from './context';

export function panelSpec(panel: string): PanelSpec {
  return (PANELS as Record<string, PanelSpec>)[panel] ?? unknownPanel(panel);
}
