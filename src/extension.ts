/**
 * WSL Diet のエントリポイント。
 *
 * package.json の `extensionKind: ["ui"]` により、Remote-WSL のウィンドウでも Windows 側（ローカル）の
 * 拡張ホストで動く。そのため `wsl --shutdown` で WSL を止めても、この拡張は動き続けられる。
 * ここではステータスバーの更新とコマンドの登録だけを行い、処理の本体は各モジュールに置く。
 */
import * as vscode from 'vscode';
import { runCompact } from './compact';
import { CONFIG_SECTION, getConfig } from './config';
import { takeSnapshot } from './snapshot';
import { showStatus } from './status';
import { renderStatusBar, renderStatusBarError } from './statusBar';

export function activate(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  item.name = 'WSL Diet';
  item.command = 'compactWsl.menu';
  context.subscriptions.push(item);

  // Windows 以外（WSL 側の拡張ホストに入れられた場合など）では何もできないので、知らせるだけにする
  if (process.platform !== 'win32') {
    item.text = '$(warning) WSL Diet';
    item.tooltip = `WSL Diet は Windows 側 (ローカル) で動く必要があります。今は ${process.platform} で動いています。`;
    item.command = undefined;
    item.show();
    return;
  }

  const refresh = async () => {
    try {
      const config = getConfig();
      renderStatusBar(item, await takeSnapshot(config.distro), config.warnThresholdGB);
    } catch (e) {
      renderStatusBarError(item, e);
    }
    item.show();
  };

  // 設定が変わったら間隔を変えられるように、タイマーは作り直せるようにしておく
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    clearInterval(timer);
    timer = setInterval(refresh, getConfig().pollIntervalMinutes * 60_000);
  };
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  context.subscriptions.push(
    vscode.commands.registerCommand('compactWsl.menu', showMenu),
    vscode.commands.registerCommand('compactWsl.showStatus', showStatus),
    vscode.commands.registerCommand('compactWsl.refresh', refresh),
    vscode.commands.registerCommand('compactWsl.compact', async () => {
      await runCompact(context, getConfig().distro, 'compact');
      await refresh();
    }),
    vscode.commands.registerCommand('compactWsl.deleteSwap', async () => {
      await runCompact(context, getConfig().distro, 'swapOnly');
      await refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        schedule();
        refresh();
      }
    }),
  );

  schedule();
  refresh();
}

/** ステータスバーをクリックしたときのメニュー。 */
async function showMenu() {
  // 削除と圧縮は、WSL に接続していない Windows 側のウィンドウからだけ実行できる
  const inWsl = vscode.env.remoteName === 'wsl';
  const items: (vscode.QuickPickItem & { command: string })[] = [
    { label: '$(info) 詳細を表示', description: 'Show Status', command: 'compactWsl.showStatus' },
    ...(inWsl
      ? []
      : [
          { label: '$(fold) 圧縮する', description: 'Compact — WSL を止めて swap 削除と vhdx 圧縮', command: 'compactWsl.compact' },
          { label: '$(trash) swap だけ削除', description: 'Delete Swap Only — 管理者権限不要', command: 'compactWsl.deleteSwap' },
        ]),
    { label: '$(refresh) サイズを再計測', description: 'Refresh Size', command: 'compactWsl.refresh' },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: 'WSL Diet',
    placeHolder: inWsl ? '削除と圧縮は、WSL に接続していない Windows 側のウィンドウから実行できます' : undefined,
  });
  if (picked) {
    await vscode.commands.executeCommand(picked.command);
  }
}

export function deactivate() {}
