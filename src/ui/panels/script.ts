import { runScript } from '../../services/script-engine';
import { B, E, icons, toast } from '../dom';
import { field } from '../fields';
import { panelFrame, type PanelContext } from './context';

const SAMPLE = `// 脚本跑在沙箱里，只能通过 mn.* 和外部交互
mn.log('收到输入：' + mn.input);
mn.echo(mn.input.toUpperCase());
mn.notify('脚本执行完成');
`;

export const scriptPanel = {
  title: '脚本引擎',
  size: 'large' as const,
  render(ctx: PanelContext): void {
    const { body, footer } = panelFrame('脚本引擎');
    let input = String(ctx.arg.input ?? '');
    const code = E('textarea', 'mn-code');
    code.rows = 10;
    code.spellcheck = false;
    code.value = String(ctx.arg.script ?? SAMPLE);

    const output = E('pre', 'mn-code');
    output.textContent = '';

    const append = (line: string): void => {
      output.textContent = `${output.textContent ?? ''}${line}\n`;
      output.scrollTop = output.scrollHeight;
    };

    body.append(
      field('输入', 'text', input, [], (value) => {
        input = String(value);
      }),
      E('p', 'mn-note', '可用 API：mn.log / mn.echo / mn.notify / mn.copy / mn.open(目标, 参数) / mn.input；超时 15 秒。'),
      code,
      E('p', 'mn-note', '输出'),
      output,
    );

    let running = false;
    footer?.append(
      B('清空输出', () => {
        output.textContent = '';
      }),
      B('运行', () => {
        if (running) return;
        running = true;
        append(`> 运行 ${new Date().toLocaleTimeString()}`);
        void runScript(code.value, input, {
          log: append,
          notify: (message) => toast(message),
          result: (text) => append(`← ${text}`),
        }).then((ok) => {
          running = false;
          append(ok ? '— 完成' : '— 失败');
        });
      }, 'mn-btn primary', 'play'),
      B('关闭', () => ctx.close()),
    );
    icons();
  },
};
