# 03. Windows・WSL との連携

パスやディストロ名はコードに埋め込まず、実行のたびに WSL 自身の情報（レジストリ、`.wslconfig`、環境変数、プロセス）から求める。

## コマンドの実行

`src/win/exec.ts`。

- `run(file, args, timeoutMs = 30 秒)`: `child_process.execFile` で実行する。失敗しても例外を投げず、終了コード・標準出力・標準エラーを返す。`windowsHide: true` でコンソールを出さない。環境変数 `WSL_UTF8=1` を付ける
- `runPowerShell(script)`: `powershell.exe -NoProfile -NonInteractive -Command` で実行する。先頭で `[Console]::OutputEncoding` を BOM なしの UTF-8 にする
- 拡張は Windows 側で動くので、ここから起動するプロセスはすべて Windows のプロセスになる

### 文字コード

| 出力元 | 文字コード | 扱い |
|---|---|---|
| `wsl.exe` | `WSL_UTF8=1` が効けば UTF-8、効かない版では UTF-16LE | `decodeWinOutput` で、先頭 64 バイトに NUL があれば UTF-16LE、なければ UTF-8 としてデコードする。BOM を除き、改行を `\n` にそろえる |
| `reg.exe` など Windows 標準のコマンド | OEM コードページ（日本語環境では Shift_JIS） | 日本語を含むパスが化けるので使わない。代わりに PowerShell で UTF-8 の JSON を出力させる |
| `powershell.exe`（`runPowerShell`） | UTF-8 | そのまま読む |
| diskpart のログ | `chcp 65001` により UTF-8 のはず。ならない場合は Shift_JIS | UTF-8 → Shift_JIS の順に厳密デコードを試し、どちらも失敗したら latin1 |

言語によって内容が変わる出力（エラーメッセージ、`wsl -l` の「(既定)」など）は解析しない。判定には、終了コード、`--quiet` の名前だけの出力、JSON を使う。

## ディストロと vhdx

`src/win/distro.ts`。

WSL はディストロをレジストリ `HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss` に登録する。

```
Lxss
  DefaultDistribution = {GUID}          既定のディストロ
  {GUID}\
    DistributionName = Ubuntu-22.04
    BasePath         = C:\Users\...\LocalState   （\\?\ が付くこともある）
    VhdFileName      = ext4.vhdx                 （無いこともある）
    Version          = 2                         （1 は WSL1）
```

PowerShell（`Get-ItemProperty` / `Get-ChildItem`）でこれを読み、次の形の JSON にして受け取る。

```json
{"DefaultDistribution":"{GUID}","Distros":[{"Id":"{GUID}","DistributionName":"Ubuntu-22.04","BasePath":"C:\\...","VhdFileName":null,"Version":2}]}
```

`parseLxssJson` の規則:

- `DistributionName` か `BasePath` が無いものは除外する
- `Version` が 2 以外（WSL1）は除外する。WSL1 は vhdx を持たない
- `BasePath` の先頭の `\\?\` を外す
- vhdx のパス = `BasePath` + `VhdFileName`（無ければ `ext4.vhdx`）
- 既定かどうかは、`Id` と `DefaultDistribution` を大文字小文字を区別せずに比べる

PowerShell が失敗した場合や、出力が空の場合は、ディストロなしとして扱う。

### 対象ディストロ

設定 `compactWsl.distro` が空でなければ、その名前と `DistributionName` が一致するもの。空なら既定のディストロ。見つからなければ「対象なし」。

### vhdx のサイズと最終更新日時

`fs.stat(vhdPath)` の `size` と `mtime`。ファイルが無ければ未設定にする。

## 起動中のディストロ

`listRunningDistros()`: `wsl.exe --list --running --quiet` の各行（空行を除く）。終了コードが 0 以外（起動中のものが無いときなど）なら空の一覧にする。このコマンドは WSL を起動しない。

## Linux 内の使用量

起動中のディストロに対してだけ、`wsl.exe -d <名前> -- sh -c "df -B1 --output=used /"` を実行する。`parseDfUsed` は出力の最後の行を数値として読み、正の数でなければ未設定にする（BusyBox の df のように `--output` が無い環境でも失敗扱いで済む）。

## swap.vhdx

`src/win/swap.ts`。

### 検出

次の候補のうち、実在するファイルを swap.vhdx とする。

1. `%TEMP%` 直下の各フォルダの中の `swap.vhdx`。WSL は VM を起動するたびに `%TEMP%\<VM の ID>\swap.vhdx` を作るので、フォルダ名は固定できない。`%TEMP%` には `process.env.TEMP`（無ければ `os.tmpdir()`）を使う
2. `%USERPROFILE%\.wslconfig` の `[wsl2]` セクションにある `swapFile` の値

`.wslconfig` の解析（`parseWslConfigSwapFile`）:

- `#` と `;` 以降はコメントとして無視する
- セクション名とキー名は大文字小文字を区別しない
- 値を囲む `"` を外し、`\\` を `\` に戻す（公式の書式ではバックスラッシュを二重に書く）

### 削除

`deleteSwapFiles(files)`: WSL を止めた後に呼び、各ファイルを `fs.rm` で削除する。

- 削除できたもの、すでに無いもの（`ENOENT`）は「削除できた」とする。WSL は正常に止まるときに自分で swap.vhdx を消すことがあるため
- それ以外のエラー（使用中など）は「削除できなかった」とする

WSL は次に起動するときに swap.vhdx を作り直す。

## WSL クライアントの検出

`src/win/wslClients.ts`。

WSL を使うものは、Windows 側では `wsl.exe` のプロセスとして見える。`Get-CimInstance Win32_Process -Filter "Name='wsl.exe'"` の `ProcessId`、`ParentProcessId`、`CommandLine` を JSON で受け取り、`classifyWslProcesses` で分類する。

- 1 つの接続が `wsl.exe` を入れ子で起動するので、親が `wsl.exe` でないもの（根）だけを数える
- 根の `CommandLine` に `.vscode-server` を含むものは、VS Code の WSL ウィンドウとみなす
- それ以外の根は「その他」（Windows Terminal の WSL タブ、Docker Desktop など）として数える

PowerShell が失敗した場合は例外にする（安全のため、判定できないまま進めない）。

## シャットダウン

`shutdownWsl(timeoutMs = 60 秒)`: `wsl.exe --shutdown` の後、`listRunningDistros()` が空になるまで 1 秒ごとに確認する。空になれば `true`、時間内にならなければ `false`。

## diskpart による圧縮

`src/win/diskpart.ts`。管理者権限が必要なのは、この処理だけ。

### 作業ファイル

`%TEMP%\compact-wsl\`（`os.tmpdir()` の下）に作る。

| ファイル | 内容 |
|---|---|
| `compact.txt` | 圧縮用の diskpart スクリプト |
| `detach.txt` | 失敗したときに切り離すための diskpart スクリプト |
| `run-diskpart.cmd` | 管理者として実行するバッチ |
| `diskpart.log` | diskpart の出力と終了コード。実行前に消す |

### diskpart スクリプト

```
select vdisk file="<vhdx のパス>"
attach vdisk readonly
compact vdisk
detach vdisk
exit
```

`compact vdisk` は、読み取り専用でアタッチした vhdx に対して実行する。Hyper-V モジュールが必要な `Optimize-VHD` は使わない（Windows Home でも動かすため）。

### バッチ

```bat
@echo off
chcp 65001 > nul
diskpart /s "compact.txt" > "diskpart.log" 2>&1
set rc=%errorlevel%
if not "%rc%"=="0" diskpart /s "detach.txt" >> "diskpart.log" 2>&1
(echo EXIT=%rc%)>> "diskpart.log"
```

- バッチは UTF-8 で書くので、`chcp 65001` で日本語を含むパスも読めるようにする
- 失敗したとき（終了コードが 0 以外）は、vhdx がアタッチされたままにならないよう `detach vdisk` を試みる
- 終了コードは `EXIT=n` としてログの最後に書く。`echo EXIT=0>> file` と書くと `0>>` がハンドル 0 のリダイレクトと解釈されてログに残らないので、括弧で囲む

### 管理者としての実行

```
powershell.exe -NoProfile -Command "Start-Process -FilePath '<run-diskpart.cmd>' -Verb RunAs -Wait -WindowStyle Hidden"
```

- `-Verb RunAs` で UAC の確認を出し、`-Wait` で終わるまで待つ（タイムアウト 30 分）
- 管理者として起動したプロセスの出力は受け取れないので、結果はログファイルで受け取る
- パス中の `'` は `''` にエスケープする

### 結果の判定

diskpart の出力は OS の言語で変わるので、成否は `EXIT=n` だけで判定する。

| 状態 | 結果 |
|---|---|
| ログが無い | `cancelled`（UAC で拒否された、または起動できなかった） |
| `EXIT=0` | `ok` |
| それ以外（`EXIT` が無い場合を含む） | `failed`（終了コードとログの内容を返す） |
