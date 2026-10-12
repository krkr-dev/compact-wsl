import * as vscode from 'vscode';
import { getConfig } from './config';
import { daysSince, formatBytes } from './format';
import { Snapshot, takeSnapshot } from './snapshot';
import { STALE_DAYS } from './statusBar';

/** 「詳細を表示」（WSL Diet: Show Status）。全ディストロと swap.vhdx の状態をダイアログで表示する。 */
export async function showStatus() {
  const snap = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'WSL Diet: 計測中' },
    () => takeSnapshot(getConfig().distro, { withLinuxUsage: true }),
  );
  await vscode.window.showInformationMessage('WSL Diet: 現在の状態', { modal: true, detail: formatStatus(snap) });
}

function formatStatus(snap: Snapshot): string {
  const lines: string[] = [];
  for (const d of snap.distros) {
    lines.push(`■ ${d.name}${d.isDefault ? ' (既定)' : ''}${d === snap.target ? ' ★対象' : ''}`);
    lines.push(`  vhdx: ${d.size !== undefined ? formatBytes(d.size) : '見つかりません'}  ${d.vhdPath}`);
    if (d.linuxUsed !== undefined) {
      lines.push(`  Linux内の使用量: ${formatBytes(d.linuxUsed)}`);
      // df の使用量には ext4 の管理情報（ジャーナルや inode テーブル）が含まれないので、実際に縮む量はこれより少ない
      if (d.size !== undefined && d.size > d.linuxUsed) {
        lines.push(`  取り戻せる見込み: 最大 約 ${formatBytes(d.size - d.linuxUsed)}`);
      }
    } else if (!d.running) {
      lines.push('  (停止中のため Linux内の使用量は未計測)');
    }
    if (d.mtime && daysSince(d.mtime) >= STALE_DAYS) {
      lines.push(`  ⚠ ${daysSince(d.mtime)}日間更新なし。使っていなければ wsl --unregister ${d.name} で削除できます`);
    }
  }

  lines.push('');
  if (snap.swaps.length) {
    for (const s of snap.swaps) {
      lines.push(`swap.vhdx: ${formatBytes(s.size)}  ${s.path}`);
    }
  } else {
    lines.push('swap.vhdx: なし');
  }
  return lines.join('\n');
}
