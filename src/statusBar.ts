import * as vscode from 'vscode';
import { bytesToGB, daysSince, formatBytes } from './format';
import { Snapshot } from './snapshot';

/** これ以上の日数更新されていない vhdx は「使われていないかも」と表示する。 */
export const STALE_DAYS = 30;

/** 対象ディストロの vhdx サイズをステータスバーに、全体の状態をツールチップに表示する。 */
export function renderStatusBar(item: vscode.StatusBarItem, snap: Snapshot, warnThresholdGB: number) {
  const t = snap.target;
  if (!t || t.size === undefined) {
    item.text = '$(database) WSL ?';
    item.tooltip = 'WSL Diet: 対象のディストロの vhdx が見つかりません';
    item.backgroundColor = undefined;
    return;
  }

  const over = bytesToGB(t.size) >= warnThresholdGB;
  item.text = `$(database) WSL ${formatBytes(t.size)}`;
  item.backgroundColor = over ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**WSL Diet**${over ? ` — ${warnThresholdGB}GB を超えています` : ''}\n\n`);
  md.appendMarkdown('| ディストロ | vhdx | 状態 |\n|---|---:|---|\n');
  for (const d of snap.distros) {
    const size = d.size !== undefined ? formatBytes(d.size) : '-';
    const state = [
      d.isDefault ? '既定' : '',
      d.running ? '起動中' : '停止',
      d.mtime && daysSince(d.mtime) >= STALE_DAYS ? `${daysSince(d.mtime)}日未使用` : '',
    ]
      .filter(Boolean)
      .join(' / ');
    md.appendMarkdown(`| ${d.name}${d === t ? ' ★' : ''} | ${size} | ${state} |\n`);
  }
  const swapTotal = snap.swaps.reduce((a, s) => a + s.size, 0);
  md.appendMarkdown(`\nswap.vhdx: ${snap.swaps.length ? formatBytes(swapTotal) : 'なし'}\n\n`);
  md.appendMarkdown('クリックでメニューを表示');
  item.tooltip = md;
}

export function renderStatusBarError(item: vscode.StatusBarItem, error: unknown) {
  item.text = '$(database) WSL ?';
  item.tooltip = `WSL Diet: サイズを取得できませんでした: ${error}`;
  item.backgroundColor = undefined;
}
