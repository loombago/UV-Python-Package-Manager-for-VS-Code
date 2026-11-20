import { execFile } from 'node:child_process';
import { ILoggerService } from './loggerService';

export interface ProcessRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ProcessResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
}

export interface IProcessRunner {
  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Executes child processes safely using execFile (no shell interpolation)
 * with configurable timeout, cancellation, and structured output capture.
 */
export class NodeProcessRunner implements IProcessRunner {
  public constructor(private readonly logger: ILoggerService) {}

  public run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const mergedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      UV_NO_PROGRESS: '1',
      PYTHONUTF8: '1',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      ...options.env,
    };

    this.logger.debug(`Executing: ${command} ${args.join(' ')}`, { cwd: options.cwd });

    return new Promise<ProcessResult>((resolve) => {
      execFile(
        command,
        args,
        {
          cwd: options.cwd,
          env: mergedEnv,
          timeout: timeoutMs,
          signal: options.signal,
          maxBuffer: MAX_OUTPUT_BUFFER_BYTES,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;

          if (!error) {
            resolve({
              command,
              args,
              exitCode: 0,
              stdout: stdout ?? '',
              stderr: stderr ?? '',
              durationMs,
              timedOut: false,
              cancelled: false,
            });
            return;
          }

          const execError = error as NodeJS.ErrnoException & {
            killed?: boolean;
            code?: number | string;
            signal?: string;
          };

          const cancelled = execError.name === 'AbortError' || Boolean(options.signal?.aborted);
          const timedOut = Boolean(execError.killed && !cancelled);
          const exitCode = typeof execError.code === 'number' ? execError.code : -1;
          const combinedStderr = stderr?.trim() ? stderr : execError.message;

          this.logger.debug(`Process exited with code ${exitCode} in ${durationMs}ms`, {
            command,
            timedOut,
            cancelled,
          });

          resolve({
            command,
            args,
            exitCode,
            stdout: stdout ?? '',
            stderr: combinedStderr ?? '',
            durationMs,
            timedOut,
            cancelled,
          });
        }
      );
    });
  }
}
