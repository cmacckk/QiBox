import { launchTool } from './desktop';

/**
 * 脚本沙箱：脚本跑在 Web Worker 里，拿不到 DOM，也拿不到 Tauri 的 invoke。
 * 想动系统只能通过 `mn.*`，由主线程转发，所以脚本能做什么是可数的。
 */
export interface ScriptEvents {
  log: (line: string) => void;
  notify: (text: string) => void;
  result: (text: string) => void;
}

const BOOTSTRAP = `
self.onmessage = async (event) => {
  const data = event.data || {};
  const post = (type, payload) => self.postMessage({ type, payload });
  const text = (value) => (value === undefined || value === null ? '' : String(value));
  const mn = {
    input: text(data.input),
    log: (...args) => post('log', args.map(text).join(' ')),
    notify: (message) => post('notify', text(message)),
    copy: (value) => post('copy', text(value)),
    open: (target, args) => post('open', { target: text(target), args: text(args) }),
    echo: (value) => post('result', text(value)),
  };
  try {
    const fn = new Function('mn', '"use strict";\\n' + text(data.script));
    const returned = await fn(mn);
    post('done', returned === undefined ? '' : text(returned));
  } catch (error) {
    post('error', error && error.message ? String(error.message) : text(error));
  }
};
`;

export function runScript(
  script: string,
  input: string,
  events: ScriptEvents,
  timeoutMs = 15_000,
): Promise<boolean> {
  const blob = new Blob([BOOTSTRAP], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean, note?: string): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.terminate();
      if (note) events.log(note);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false, `脚本超过 ${timeoutMs / 1000} 秒，已终止`), timeoutMs);

    worker.onerror = (event) => finish(false, `脚本错误：${event.message || '未知错误'}`);
    worker.onmessage = (event: MessageEvent<{ type: string; payload: unknown }>) => {
      const { type, payload } = event.data;
      if (type === 'log') {
        events.log(String(payload));
        return;
      }
      if (type === 'notify') {
        events.notify(String(payload));
        return;
      }
      if (type === 'copy') {
        void navigator.clipboard.writeText(String(payload)).catch(() => events.log('复制失败：浏览器拒绝了剪贴板'));
        return;
      }
      if (type === 'open') {
        const { target, args } = payload as { target: string; args: string };
        void launchTool({ target, args, workDir: '', admin: false })
          .then(() => events.log(`已请求启动：${target}`))
          .catch((error: unknown) => events.log(`启动失败：${error instanceof Error ? error.message : String(error)}`));
        return;
      }
      if (type === 'result') {
        events.result(String(payload));
        return;
      }
      if (type === 'done') {
        if (payload) events.result(String(payload));
        finish(true);
        return;
      }
      if (type === 'error') finish(false, `脚本错误：${String(payload)}`);
    };

    worker.postMessage({ script, input });
  });
}
