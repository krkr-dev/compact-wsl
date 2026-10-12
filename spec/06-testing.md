# 06. テスト

## 単体テスト

```sh
npm test
```

`tsconfig.test.json` で `test/` と `vscode` に依存しないモジュールだけをコンパイルし、`node --test` で実行する。WSL 上の Node.js でも実行できる。

| ファイル | 対象 | 主な確認内容 |
|---|---|---|
| `test/parse.test.ts` | `parseLxssJson`、`decodeWinOutput`、`parseDfUsed`、`parseWslConfigSwapFile`、`formatBytes`、`daysSince` | 実機のレジストリ出力、日本語のパス、`\\?\` の接頭辞、`VhdFileName`、WSL1 の除外、UTF-16LE と UTF-8、`.wslconfig` のセクションとコメント |
| `test/swap.test.ts` | `findSwapFiles`、`deleteSwapFiles` | `%TEMP%` 直下のフォルダと `.wslconfig` の `swapFile` の検出、すでに無いファイルを削除済みとして扱うこと |
| `test/diskpart.test.ts` | `compactScript`、`runnerBatch`、`parseExitCode` | スクリプトの順序、失敗時だけ detach すること、`EXIT=` のリダイレクトを括弧で囲むこと、負の終了コード |
| `test/wslClients.test.ts` | `classifyWslProcesses` | 実機の VS Code の WSL ウィンドウのプロセス、入れ子の `wsl.exe` を数えないこと |

## 手動での確認

VS Code の API、UAC、実際の WSL の停止が絡む部分は、実機で確認する。

### 準備

1. `npm run package` で VSIX を作り、Windows 側（ローカル）の VS Code に入れる（→ [README](../README.md#インストール)）
2. 「Developer: Reload Window」を実行する

### 確認項目

| # | 操作 | 期待する結果 |
|---|---|---|
| 1 | Windows 側のウィンドウと WSL のウィンドウのそれぞれでステータスバーを見る | どちらにも `WSL ○GB` が出る。ツールチップに全ディストロと swap.vhdx が出る |
| 2 | 「詳細を表示」 | 起動中のディストロには Linux 内の使用量と「取り戻せる見込み: 最大 約 ○GB」が出る |
| 3 | WSL のウィンドウでメニューとコマンドパレットを開く | 「圧縮する」「swap だけ削除」が出ない |
| 4 | WSL のウィンドウを開いたまま、Windows 側のウィンドウで「圧縮する」 | 「WSL を使っているものがあるため中断しました」に「VS Code の WSL ウィンドウ」が出る |
| 5 | WSL のウィンドウをすべて閉じてから「swap だけ削除」 | 確認ダイアログの後、swap.vhdx の削除が通知される。ステータスバーの swap が「なし」になる |
| 6 | 同じ状態で「圧縮する」 | UAC の確認が出る。許可すると「○GB → ○GB（-○GB）」が通知される |
| 7 | 6 で UAC を拒否する | 「UAC がキャンセルされたため圧縮はしていません。」が通知される |
| 8 | 圧縮の後に WSL を起動する | 正常に起動し、`free -h` で Swap が表示される（swap.vhdx が作り直される） |
