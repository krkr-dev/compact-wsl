# 04. 設定と状態

## 設定

VS Code の設定（`contributes.configuration`、セクション `compactWsl`）。`src/config.ts` の `getConfig()` で読む。

| キー | 型 | 既定値 | 範囲 | 内容 |
|---|---|---|---|---|
| `compactWsl.distro` | string | `""` | — | 対象のディストロ名。空なら WSL の既定のディストロ |
| `compactWsl.warnThresholdGB` | number | `50` | 1 以上 | vhdx がこのサイズ (GB) 以上になったらステータスバーを警告色にする |
| `compactWsl.pollIntervalMinutes` | number | `5` | 1 以上 | vhdx のサイズを測る間隔 (分) |

設定が変わると、ステータスバーを測り直し、更新の間隔を作り直す。

パスやディストロの一覧は WSL 自身の情報から求めるので（→ [03](03-windows-integration.md)）、設定には持たない。

## globalState

`ExtensionContext.globalState` に保存する値。

| キー | 型 | 内容 |
|---|---|---|
| `compactWsl.backupHintShown` | boolean | 確認ダイアログでバックアップの案内を出したか。一度「WSL を止めて圧縮 / swap を削除」を押すと `true` になり、以後は案内を出さない |

## 作成するファイル

| 場所 | 作成するとき | 内容 |
|---|---|---|
| `%TEMP%\compact-wsl\compact.txt`<br>`%TEMP%\compact-wsl\detach.txt`<br>`%TEMP%\compact-wsl\run-diskpart.cmd`<br>`%TEMP%\compact-wsl\diskpart.log` | 圧縮のたび（上書き） | → [03 の作業ファイル](03-windows-integration.md#作業ファイル) |

これら以外のファイルは作らない。削除するファイルは swap.vhdx だけ。
