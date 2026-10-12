import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { run } from './exec';

/**
 * diskpart による vhdx の圧縮。
 *
 * 管理者権限が必要なのはここだけなので、diskpart を呼ぶバッチだけを UAC 経由で実行する。
 * 管理者として起動したプロセスの出力は受け取れないため、結果はログファイル経由で受け取る。
 * 作業用のファイルは %TEMP%\compact-wsl\ に置く（compact.txt / detach.txt / run-diskpart.cmd / diskpart.log）。
 */

/** 圧縮用の diskpart スクリプト。readonly でアタッチすると compact vdisk が使える。 */
export function compactScript(vhdPath: string): string {
  return [`select vdisk file="${vhdPath}"`, 'attach vdisk readonly', 'compact vdisk', 'detach vdisk', 'exit', ''].join('\r\n');
}

/** compact が途中で失敗したときに、アタッチされたままにしないための後片付け。 */
export function detachScript(vhdPath: string): string {
  return [`select vdisk file="${vhdPath}"`, 'detach vdisk', 'exit', ''].join('\r\n');
}

/**
 * 管理者権限で実行するバッチ。diskpart の終了コードをログの最後に EXIT=n として書く。
 * diskpart の出力は OS の言語で変わるので、成否は終了コードだけで判定する。
 */
export function runnerBatch(files: { compact: string; detach: string; log: string }): string {
  return [
    '@echo off',
    // このファイルは UTF-8 で書くので、ユーザー名などに日本語を含むパスも読めるようにする
    'chcp 65001 > nul',
    `diskpart /s "${files.compact}" > "${files.log}" 2>&1`,
    'set rc=%errorlevel%',
    `if not "%rc%"=="0" diskpart /s "${files.detach}" >> "${files.log}" 2>&1`,
    // `echo EXIT=0>> file` だと 0>> がハンドル 0 のリダイレクトと解釈されてログに書かれないので括弧で囲む
    `(echo EXIT=%rc%)>> "${files.log}"`,
    '',
  ].join('\r\n');
}

/** ログの最後の `EXIT=n` を読む。無ければ（途中で止まったなど）undefined。 */
export function parseExitCode(log: string): number | undefined {
  const m = /EXIT=(-?\d+)\s*$/.exec(log);
  return m ? Number(m[1]) : undefined;
}

export type DiskpartResult =
  | { kind: 'ok' }
  | { kind: 'cancelled' } // UAC で拒否された、または起動できなかった
  | { kind: 'failed'; exitCode: number | undefined; log: string };

function decodeLog(buf: Buffer): string {
  // chcp 65001 で UTF-8 になるはずだが、diskpart が OEM コードページ（日本語環境では Shift_JIS）で書くこともある
  for (const enc of ['utf-8', 'shift_jis']) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(buf);
    } catch {
      // 次の候補へ
    }
  }
  return buf.toString('latin1');
}

/** vhdx を diskpart で圧縮する。UAC の確認が出る。 */
export async function compactVhd(vhdPath: string): Promise<DiskpartResult> {
  const dir = path.join(os.tmpdir(), 'compact-wsl');
  await fs.mkdir(dir, { recursive: true });
  const files = {
    compact: path.join(dir, 'compact.txt'),
    detach: path.join(dir, 'detach.txt'),
    log: path.join(dir, 'diskpart.log'),
    batch: path.join(dir, 'run-diskpart.cmd'),
  };
  await fs.writeFile(files.compact, compactScript(vhdPath));
  await fs.writeFile(files.detach, detachScript(vhdPath));
  await fs.writeFile(files.batch, runnerBatch(files));
  await fs.rm(files.log, { force: true });

  // Start-Process -Verb RunAs で UAC を出し、-Wait で終わるまで待つ。
  // UAC で拒否されると Start-Process が失敗してバッチが動かず、ログが作られない（→ cancelled）
  const quoted = files.batch.replace(/'/g, "''");
  await run(
    'powershell.exe',
    ['-NoProfile', '-Command', `Start-Process -FilePath '${quoted}' -Verb RunAs -Wait -WindowStyle Hidden`],
    30 * 60_000,
  );

  let log: string;
  try {
    log = decodeLog(await fs.readFile(files.log));
  } catch {
    return { kind: 'cancelled' };
  }
  const exitCode = parseExitCode(log);
  return exitCode === 0 ? { kind: 'ok' } : { kind: 'failed', exitCode, log };
}
