/**
 * 「圧縮する」（WSL Diet: Compact）と「swap だけ削除」（WSL Diet: Delete Swap Only）。
 *
 * 流れ:
 *   1. 事前チェック   … Windows 側のウィンドウか、WSL を使っているもの（WSL ウィンドウやターミナル）が無いか
 *   2. 確認ダイアログ
 *   3. 実行          … fstrim → wsl --shutdown → swap.vhdx 削除 →（compact のみ）再 shutdown → diskpart で圧縮
 *   4. 結果の通知
 */
import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import { formatBytes } from './format';
import { DistroInfo, Snapshot, takeSnapshot } from './snapshot';
import { compactVhd, DiskpartResult } from './win/diskpart';
import { runInDistro, shutdownWsl } from './win/exec';
import { deleteSwapFiles } from './win/swap';
import { findWslClients } from './win/wslClients';

export type CompactMode = 'compact' | 'swapOnly';

/** 初回だけバックアップを勧めるための globalState のキー */
const BACKUP_HINT_KEY = 'compactWsl.backupHintShown';

type RunResult =
  | { kind: 'error'; message: string }
  | { kind: 'done'; swapFreed: number; swapFailed: number; diskpart?: DiskpartResult };

export async function runCompact(ctx: vscode.ExtensionContext, targetName: string, mode: CompactMode) {
  if (!(await preflight())) {
    return;
  }

  const snap = await takeSnapshot(targetName);
  const target = snap.target;
  if (!target || target.size === undefined) {
    vscode.window.showErrorMessage('WSL Diet: 対象のディストロの vhdx が見つかりません。設定 compactWsl.distro を確認してください。');
    return;
  }

  if (!(await confirm(ctx, target, mode))) {
    return;
  }

  const before = target.size;
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'WSL Diet' },
    (progress) => execute(snap, target, mode, (message) => progress.report({ message })),
  );

  if (result.kind === 'error') {
    vscode.window.showErrorMessage(`WSL Diet: ${result.message}`);
    return;
  }
  const after = result.diskpart?.kind === 'ok' ? ((await fileSize(target.vhdPath)) ?? before) : before;
  await report(target, before, after, result);
}

/**
 * 実行してよい状態かを確かめる。だめなら理由を表示して false を返す。
 * WSL を使っているもの（Remote-WSL のウィンドウ、ターミナルなど）があると、止めた直後に WSL が起動し直されて
 * swap の削除や圧縮ができないため、それらが無いときだけ実行する。
 */
async function preflight(): Promise<boolean> {
  if (vscode.env.remoteName === 'wsl') {
    vscode.window.showErrorMessage('WSL Diet: 削除と圧縮は、WSL に接続していない Windows 側のウィンドウから実行してください。');
    return false;
  }

  const clients = await findWslClients();
  if (clients.vscode || clients.others > 0) {
    const using = [
      clients.vscode ? '・VS Code の WSL ウィンドウ' : '',
      clients.others > 0 ? `・その他 ${clients.others} 件（Windows Terminal の WSL タブ、Docker Desktop など）` : '',
    ]
      .filter(Boolean)
      .join('\n');
    vscode.window.showWarningMessage('WSL Diet: WSL を使っているものがあるため中断しました', {
      modal: true,
      detail: `WSL を止めても、次のものがすぐに起動し直してしまいます。閉じてから、もう一度実行してください。\n\n${using}`,
    });
    return false;
  }
  return true;
}

async function confirm(ctx: vscode.ExtensionContext, target: DistroInfo, mode: CompactMode): Promise<boolean> {
  const detail = [
    '開いているファイルや、WSL 内で動いている作業を保存してください。',
    mode === 'compact' ? '圧縮には管理者権限が必要なので、UAC の確認が出ます。' : '',
    ctx.globalState.get(BACKUP_HINT_KEY)
      ? ''
      : `初めての圧縮の前には、念のためバックアップを取っておくと安心です:\nwsl --export ${target.name} D:\\backup\\${target.name}.tar`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const go = mode === 'compact' ? 'WSL を止めて圧縮' : 'WSL を止めて swap を削除';
  if ((await vscode.window.showWarningMessage('WSL Diet: WSL がすべて停止します', { modal: true, detail }, go)) !== go) {
    return false;
  }
  await ctx.globalState.update(BACKUP_HINT_KEY, true);
  return true;
}

async function execute(snap: Snapshot, target: DistroInfo, mode: CompactMode, step: (message: string) => void): Promise<RunResult> {
  if (mode === 'compact' && target.running) {
    // 削除済みのブロックを vhdx に伝えておかないと、圧縮しても縮まない
    step('fstrim で空き領域を解放中…');
    await runInDistro(target.name, 'fstrim -v /', { root: true, timeoutMs: 10 * 60_000 });
  }

  step('WSL をシャットダウン中…');
  if (!(await shutdownWsl())) {
    return { kind: 'error', message: 'WSL が停止しませんでした。' };
  }

  step('swap.vhdx を削除中…');
  const swap = await deleteSwapFiles(snap.swaps);
  const swapFreed = swap.deleted.reduce((a, s) => a + s.size, 0);
  if (mode === 'swapOnly') {
    return { kind: 'done', swapFreed, swapFailed: swap.failed.length };
  }

  // 事前チェックの後に WSL が起動されている可能性もあるので、圧縮の直前にもう一度止まっていることを確かめる
  step('WSL の停止を再確認中…');
  if (!(await shutdownWsl())) {
    return { kind: 'error', message: 'WSL が停止しませんでした。' };
  }

  step('diskpart で ext4.vhdx を圧縮中…（数分かかります。UAC の確認が出たら許可してください）');
  const diskpart = await compactVhd(target.vhdPath);
  return { kind: 'done', swapFreed, swapFailed: swap.failed.length, diskpart };
}

async function report(target: DistroInfo, before: number, after: number, result: Extract<RunResult, { kind: 'done' }>) {
  const parts: string[] = [];
  if (result.diskpart?.kind === 'ok') {
    parts.push(`${target.name}: ${formatBytes(before)} → ${formatBytes(after)}（-${formatBytes(Math.max(0, before - after))}）`);
  }
  parts.push(result.swapFreed > 0 ? `swap.vhdx ${formatBytes(result.swapFreed)} を削除` : 'swap.vhdx はありませんでした');
  if (result.swapFailed > 0) {
    parts.push(`swap.vhdx ${result.swapFailed} 件は削除できませんでした`);
  }
  const summary = parts.join(' / ');

  switch (result.diskpart?.kind) {
    case 'cancelled':
      vscode.window.showWarningMessage(`WSL Diet: UAC がキャンセルされたため圧縮はしていません。${summary}`);
      return;
    case 'failed': {
      const { exitCode, log } = result.diskpart;
      const picked = await vscode.window.showErrorMessage(
        `WSL Diet: diskpart が失敗しました（終了コード ${exitCode ?? '不明'}）。${summary}`,
        'ログを開く',
      );
      if (picked === 'ログを開く') {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ content: log }));
      }
      return;
    }
    default:
      vscode.window.showInformationMessage(`WSL Diet: ${summary}`);
  }
}

async function fileSize(p: string): Promise<number | undefined> {
  try {
    return (await fs.stat(p)).size;
  } catch {
    return undefined;
  }
}
