import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { compactScript, parseExitCode, runnerBatch } from '../src/win/diskpart';

const VHD = 'C:\\Users\\admin\\AppData\\Local\\Packages\\X\\LocalState\\ext4.vhdx';

test('compactScript: readonly でアタッチし、最後に detach する', () => {
  const lines = compactScript(VHD).trim().split('\r\n');
  assert.deepEqual(lines, [`select vdisk file="${VHD}"`, 'attach vdisk readonly', 'compact vdisk', 'detach vdisk', 'exit']);
});

test('runnerBatch: 失敗時だけ detach を走らせ、終了コードを記録する', () => {
  const bat = runnerBatch({ compact: 'C:\\t\\c.txt', detach: 'C:\\t\\d.txt', log: 'C:\\t\\l.log' });
  assert.match(bat, /diskpart \/s "C:\\t\\c\.txt" > "C:\\t\\l\.log" 2>&1/);
  assert.match(bat, /if not "%rc%"=="0" diskpart \/s "C:\\t\\d\.txt"/);
  // 数字の直後に >> を置くとハンドル番号と解釈されるので、括弧で囲んでいること
  assert.match(bat, /\(echo EXIT=%rc%\)>> "C:\\t\\l\.log"/);
});

test('parseExitCode', () => {
  assert.equal(parseExitCode('DiskPart は仮想ディスク ファイルを正常に圧縮しました。\r\nEXIT=0\r\n'), 0);
  assert.equal(parseExitCode('仮想ディスク サービス エラー:\r\nEXIT=-2147024864 \r\n'), -2147024864);
  assert.equal(parseExitCode('途中で止まったログ'), undefined);
});
