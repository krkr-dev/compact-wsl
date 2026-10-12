# Changelog

## 0.1.0

最初のリリース。

- ステータスバーに対象ディストロの ext4.vhdx のサイズを表示（しきい値を超えたら警告色）
- ツールチップに全ディストロの vhdx サイズ・起動状態・長期間未使用の印と swap.vhdx のサイズを表示
- `WSL Diet: Show Status` … Linux 内の使用量と取り戻せる容量（最大）を表示
- `WSL Diet: Compact` … fstrim → `wsl --shutdown` → swap.vhdx 削除 → diskpart で ext4.vhdx を圧縮
- `WSL Diet: Delete Swap Only` … `wsl --shutdown` → swap.vhdx 削除（管理者権限不要）
- 削除と圧縮は Windows 側のウィンドウからだけ実行でき、WSL を使っているもの（WSL ウィンドウ、ターミナルなど）があれば中断する
