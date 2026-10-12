import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { deleteSwapFiles, findSwapFiles } from '../src/win/swap';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'compact-wsl-test-'));
}

test('findSwapFiles: TEMP 直下のフォルダの swap.vhdx と .wslconfig の swapFile を見つける', async () => {
  const temp = await tempDir();
  await fs.mkdir(path.join(temp, 'AAAA-VM-ID'));
  await fs.writeFile(path.join(temp, 'AAAA-VM-ID', 'swap.vhdx'), 'x'.repeat(10));
  await fs.mkdir(path.join(temp, 'unrelated'));
  const custom = path.join(temp, 'custom-swap.vhdx');
  await fs.writeFile(custom, 'x'.repeat(3));
  const wslconfig = path.join(temp, '.wslconfig');
  await fs.writeFile(wslconfig, `[wsl2]\nswapFile=${custom.replace(/\\/g, '\\\\')}\n`);

  const found = await findSwapFiles(temp, wslconfig);
  assert.deepEqual(
    found.map((f) => [path.basename(path.dirname(f.path)) + '/' + path.basename(f.path), f.size]).sort(),
    [
      ['AAAA-VM-ID/swap.vhdx', 10],
      [`${path.basename(temp)}/custom-swap.vhdx`, 3],
    ],
  );
});

test('deleteSwapFiles: すでに無いファイル（WSL が消したもの）も削除できたものとして扱う', async () => {
  const temp = await tempDir();
  const exists = path.join(temp, 'swap.vhdx');
  await fs.writeFile(exists, 'x');
  const gone = path.join(temp, 'gone', 'swap.vhdx');

  const r = await deleteSwapFiles([
    { path: exists, size: 1 },
    { path: gone, size: 2 },
  ]);
  assert.equal(r.deleted.length, 2);
  assert.equal(r.failed.length, 0);
  await assert.rejects(fs.stat(exists));
});
