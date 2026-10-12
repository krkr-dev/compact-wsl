# WSL Diet 仕様書

WSL Diet（パッケージ名 `compact-wsl`）の内部仕様をまとめたドキュメント。利用方法はリポジトリ直下の [README](../README.md) を参照。

| ファイル | 内容 |
|---|---|
| [01-overview.md](01-overview.md) | 目的、用語、全体構成、モジュール構成 |
| [02-features.md](02-features.md) | 各機能（ステータスバー、メニュー、詳細表示、圧縮、swap 削除）の動作 |
| [03-windows-integration.md](03-windows-integration.md) | ディストロ・vhdx・swap.vhdx の検出方法、WSL の利用状況の判定、diskpart の実行方法、文字コードの扱い |
| [04-settings-and-state.md](04-settings-and-state.md) | 設定項目、保存する状態、作成するファイル |
| [05-constraints.md](05-constraints.md) | 動作環境、制約、既知の制限、安全対策 |
| [06-testing.md](06-testing.md) | 単体テストと手動での確認手順 |
