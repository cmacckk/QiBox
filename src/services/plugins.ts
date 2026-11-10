import { isDesktop, invokeCommand } from './desktop';

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  keywords: string;
  entry: string;
}

export async function listPlugins(): Promise<PluginInfo[]> {
  if (!isDesktop()) return [];
  return invokeCommand<PluginInfo[]>('list_plugins', {});
}

export async function readPluginScript(name: string): Promise<string> {
  return invokeCommand<string>('read_plugin_script', { name });
}

export async function installPlugin(source: string): Promise<string> {
  return invokeCommand<string>('install_plugin', { source });
}

export async function removePlugin(name: string): Promise<void> {
  await invokeCommand<void>('remove_plugin', { name });
}

export async function openPluginsDir(): Promise<void> {
  await invokeCommand<void>('open_plugins_dir', {});
}
