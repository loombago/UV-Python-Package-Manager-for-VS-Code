import * as vscode from 'vscode';

export interface ILoggerService extends vscode.Disposable {
  debug(message: string, ...meta: unknown[]): void;
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
  show(preserveFocus?: boolean): void;
}

/**
 * Logger implementation backed by a VS Code OutputChannel.
 */
export class VsCodeLoggerService implements ILoggerService {
  private readonly channel: vscode.OutputChannel;

  public constructor(channel?: vscode.OutputChannel) {
    this.channel = channel ?? vscode.window.createOutputChannel('UV Package Manager');
  }

  public debug(message: string, ...meta: unknown[]): void {
    this.write('DEBUG', message, meta);
  }

  public info(message: string, ...meta: unknown[]): void {
    this.write('INFO', message, meta);
  }

  public warn(message: string, ...meta: unknown[]): void {
    this.write('WARN', message, meta);
  }

  public error(message: string, ...meta: unknown[]): void {
    this.write('ERROR', message, meta);
  }

  public show(preserveFocus = true): void {
    this.channel.show(preserveFocus);
  }

  public dispose(): void {
    this.channel.dispose();
  }

  private write(level: string, message: string, meta: unknown[]): void {
    const timestamp = new Date().toISOString();
    const formattedMeta =
      meta.length > 0
        ? ' ' +
          meta
            .map((item) => {
              if (item instanceof Error) {
                return `${item.name}: ${item.message}`;
              }
              if (typeof item === 'string') {
                return item;
              }
              try {
                return JSON.stringify(item);
              } catch {
                return String(item);
              }
            })
            .join(' ')
        : '';

    this.channel.appendLine(`[${timestamp}] [${level}] ${message}${formattedMeta}`);
  }
}
