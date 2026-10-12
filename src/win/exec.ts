import { execFile } from 'node:child_process';
import { decodeWinOutput } from './decode';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Windows 側のコマンド（wsl.exe / powershell.exe など）を呼び出す処理。
 * 拡張は Windows 側で動くので、ここから呼ぶコマンドはすべて Windows のプロセスになる。
 */

/**
 * Windows のコマンドを実行する。失敗しても throw せず、終了コードを返す。
 * WSL_UTF8=1 を付けて、wsl.exe の出力を UTF-8 にする（効かない版もあるので decodeWinOutput で両対応）。
 */
export function run(file: string, args: string[], timeoutMs = 30_000): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        encoding: 'buffer',
        timeout: timeoutMs,
        windowsHide: true,
        env: { ...process.env, WSL_UTF8: '1' },
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
        resolve({ code, stdout: decodeWinOutput(stdout), stderr: decodeWinOutput(stderr) });
      },
    );
  });
}

/**
 * PowerShell のスクリプトを実行する。出力は UTF-8 にする。
 * reg.exe などの出力は OEM コードページ（日本語環境では Shift_JIS）になり、日本語を含むパスが化けるため。
 */
export function runPowerShell(script: string, timeoutMs?: number): Promise<ExecResult> {
  const utf8 = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false';
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `${utf8}; ${script}`], timeoutMs);
}

/**
 * 起動中のディストロ名の一覧。
 * `--quiet` で名前だけにする（通常の出力は OS の言語で「(既定)」などが付くため）。
 * 起動中のものが無いときは終了コードが 0 以外になるので、空として扱う。
 */
export async function listRunningDistros(): Promise<string[]> {
  const r = await run('wsl.exe', ['--list', '--running', '--quiet']);
  if (r.code !== 0) {
    return [];
  }
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * `wsl --shutdown` して、すべてのディストロが止まるまで待つ。止まれば true。
 * WSL を使っているもの（Remote-WSL のウィンドウなど）が残っていると、すぐ起動し直されて false になる。
 */
export async function shutdownWsl(timeoutMs = 60_000): Promise<boolean> {
  await run('wsl.exe', ['--shutdown'], timeoutMs);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await listRunningDistros()).length === 0) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/**
 * ディストロ内でコマンドを実行する。停止中のディストロは起動されるので、起動中のものに対してだけ使う。
 * root: true なら root で実行する（sudo のパスワードは要らない）。
 */
export function runInDistro(distro: string, command: string, opts: { root?: boolean; timeoutMs?: number } = {}) {
  const args = ['-d', distro];
  if (opts.root) {
    args.push('-u', 'root');
  }
  args.push('--', 'sh', '-c', command);
  return run('wsl.exe', args, opts.timeoutMs);
}
