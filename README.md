# WSL Diet

WSL2 の仮想ディスク（`ext4.vhdx`）と `swap.vhdx` のサイズを VS Code のステータスバーに表示し、VS Code から swap.vhdx の削除と vhdx の圧縮ができる拡張機能です。

WSL2 の vhdx は使うほど大きくなり、Linux 内でファイルを消しても自動では縮みません。WSL Diet を入れておくと、どれだけ膨らんでいるかが常に見え、必要なときにメニューから縮められます。

## 機能

- **ステータスバーにサイズを表示**
  - 対象ディストロの vhdx のサイズを常に表示します（例: `WSL 43.9GB`）
  - 設定したサイズを超えると警告色になります
  - マウスを乗せると、全ディストロの vhdx のサイズ、起動状態、長く使われていないディストロ、swap.vhdx のサイズが表示されます
- **詳細を表示**
  - Linux 内の使用量と、圧縮で取り戻せる容量（最大）を表示します
- **圧縮する**
  - WSL を停止し、swap.vhdx を削除してから、`diskpart` で vhdx を圧縮します
  - 前後のサイズと、減った量を通知します
- **swap だけ削除**
  - WSL を停止し、swap.vhdx だけを削除します。管理者権限は要りません
- **安全のための確認**
  - 削除と圧縮の前に、確認ダイアログを出します
  - WSL を使っているもの（VS Code の WSL ウィンドウ、Windows Terminal の WSL タブなど）が残っている場合は、実行せずに知らせます

ディストロや vhdx、swap.vhdx の場所は、WSL の登録情報（レジストリ）や `.wslconfig` から自動で見つけます。設定しなくても使えます。

## 動作環境

| 項目 | 条件 |
|---|---|
| OS | Windows 11 |
| WSL | WSL2 |
| VS Code | 1.100 以上 |
| 権限 | 圧縮する場合は管理者権限（UAC の確認で許可できること） |

## 制約

- **削除と圧縮は、WSL に接続していない VS Code のウィンドウから実行します。** WSL のウィンドウでは、メニューに表示されません
- **削除と圧縮の前に、WSL を使っているものをすべて閉じてください。** VS Code の WSL ウィンドウ、Windows Terminal の WSL タブ、Docker Desktop などが残っていると、WSL を止めてもすぐに起動し直してしまうため、実行を中断します
- **削除と圧縮を行うと、WSL のすべてのディストロが停止します**
- **圧縮するのは、対象ディストロの vhdx だけです**
- **スパース vhdx（`wsl --manage <distro> --set-sparse true` や `.wslconfig` の `sparseVhd=true`）には対応していません**
- **WSL1 のディストロは対象外です**
- 「取り戻せる見込み」は上限の目安です。ext4 の管理情報の分は縮まないため、実際に減る量はこれより少なくなります

## インストール

Marketplace には公開していません。VSIX ファイルを作って、VS Code に入れます。

### 1. VSIX を作る

Node.js 20 以上が必要です。

```sh
git clone https://github.com/krkr-dev/compact-wsl.git
cd compact-wsl
npm install
npm run package
```

`compact-wsl-<バージョン>.vsix` ができます。

### 2. VS Code に入れる

**Windows 側（ローカル）の VS Code に入れてください。** WSL 側に入れると動きません。

1. VSIX を Windows 側のフォルダ（例: `C:\Users\<ユーザー名>\Downloads`）に置きます
   - `\\wsl.localhost\...` のパスのままだと、VS Code が読み込めずにエラー（`ERR_UNC_HOST_NOT_ALLOWED`）になります
2. 次のどちらかで入れます
   - Windows の PowerShell で `code --install-extension C:\Users\<ユーザー名>\Downloads\compact-wsl-<バージョン>.vsix`
   - VS Code のコマンドパレットで「Extensions: Install from VSIX...」を選び、VSIX を指定する
3. コマンドパレットで「Developer: Reload Window」を実行します

拡張機能ビューの「ローカル - インストール済み」に **WSL Diet** が表示されていれば成功です。

> WSL のターミナルで `code --install-extension` を実行すると、WSL 側に入ってしまいます。

## 使い方

VS Code を起動すると、ステータスバー（画面の一番下の帯）の左側に `WSL ○GB` が表示されます。クリックするとメニューが開きます。

| メニュー | 内容 |
|---|---|
| 詳細を表示 | 全ディストロと swap.vhdx の状態を表示します |
| 圧縮する | swap.vhdx の削除と vhdx の圧縮を行います |
| swap だけ削除 | swap.vhdx だけを削除します |
| サイズを再計測 | サイズを測り直します |

同じ操作は、コマンドパレットの `WSL Diet: ...` からも実行できます。

### 詳細を表示する

起動中のディストロについては、Linux 内の使用量と「取り戻せる見込み」が表示されます。30 日以上使われていないディストロには、`wsl --unregister` で削除できることが案内されます。

### 圧縮する

1. 作業中のファイルを保存し、**WSL に接続している VS Code のウィンドウと、WSL を使っているターミナルなどをすべて閉じます**
2. WSL に接続していない VS Code のウィンドウで、ステータスバーをクリックし「圧縮する」を選びます
3. 確認ダイアログで「WSL を止めて圧縮」を押します
4. UAC の確認が出たら「はい」を押します
5. 数分待つと、結果が通知されます（例: `Ubuntu-22.04: 43.9GB → 40.2GB（-3.7GB）`）

終わったら、WSL のウィンドウを開き直せば、いつもどおり使えます。

初めて圧縮するときは、念のため次のコマンドでバックアップを取っておくと安心です。

```powershell
wsl --export <ディストロ名> D:\backup\<ディストロ名>.tar
```

**よりよく縮めるには**：圧縮を始めるときに対象ディストロが起動していると、先に `fstrim` を実行して、削除済みの領域を解放します。停止中の場合は `fstrim` を行わないので、あまり縮まないことがあります。

### swap だけ削除する

「圧縮する」と同じように、WSL を使っているものを閉じてから「swap だけ削除」を選びます。管理者権限は要りません。swap.vhdx は、次に WSL を起動したときに作り直されます。

### うまくいかないとき

| 表示 | 対処 |
|---|---|
| WSL を使っているものがあるため中断しました | 表示されたもの（VS Code の WSL ウィンドウ、ターミナルなど）を閉じてから、もう一度実行してください |
| WSL が停止しませんでした | WSL を起動し直すもの（上と同じ）が残っていないか確認してください |
| UAC がキャンセルされたため圧縮はしていません | もう一度実行し、UAC の確認で「はい」を押してください |
| diskpart が失敗しました | 「ログを開く」で内容を確認してください。ログは `%TEMP%\compact-wsl\diskpart.log` にも残ります |
| ステータスバーに `⚠ WSL Diet` | 拡張が WSL 側に入っています。Windows 側（ローカル）に入れ直してください |
| ステータスバーに `WSL ?` | 対象のディストロが見つかりません。設定 `compactWsl.distro` を確認してください |

## 設定

| 設定 | 既定値 | 内容 |
|---|---|---|
| `compactWsl.distro` | `""` | 対象のディストロ名。空なら WSL の既定のディストロ |
| `compactWsl.warnThresholdGB` | `50` | vhdx がこのサイズ (GB) 以上になったら、ステータスバーを警告色にする |
| `compactWsl.pollIntervalMinutes` | `5` | vhdx のサイズを測る間隔（分） |

## 開発

```sh
npm install
npm run build       # dist/extension.js にビルド
npm run watch       # 変更を監視してビルド
npm run typecheck   # 型チェック
npm test            # 単体テスト（WSL 上の Node.js でも実行できる）
npm run package     # VSIX を作る
```

内部の仕様は [spec/](spec/README.md) にまとめています。

## ライセンス

[MIT](LICENSE)
