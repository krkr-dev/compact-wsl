import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { decodeWinOutput } from '../src/win/decode';
import { parseDfUsed, parseLxssJson } from '../src/win/distro';
import { parseWslConfigSwapFile } from '../src/win/swap';
import { daysSince, formatBytes } from '../src/format';

// 開発機での LXSS_SCRIPT の実出力
const LXSS_REAL =
  '{"DefaultDistribution":"{20df4a12-c595-4bcf-b435-3e246472733d}","Distros":[' +
  '{"Id":"{20df4a12-c595-4bcf-b435-3e246472733d}","DistributionName":"Ubuntu-22.04","BasePath":"C:\\\\Users\\\\admin\\\\AppData\\\\Local\\\\Packages\\\\CanonicalGroupLimited.Ubuntu22.04LTS_79rhkp1fndgsc\\\\LocalState","VhdFileName":null,"Version":2},' +
  '{"Id":"{efa316b0-821f-40e2-9e7d-9bee3add1faf}","DistributionName":"Ubuntu","BasePath":"C:\\\\Users\\\\admin\\\\AppData\\\\Local\\\\Packages\\\\CanonicalGroupLimited.UbuntuonWindows_79rhkp1fndgsc\\\\LocalState","VhdFileName":null,"Version":2}]}';

test('parseLxssJson: ディストロと既定を読む（実出力）', () => {
  assert.deepEqual(
    parseLxssJson(LXSS_REAL).map((d) => [d.name, d.isDefault, d.vhdPath]),
    [
      ['Ubuntu-22.04', true, 'C:\\Users\\admin\\AppData\\Local\\Packages\\CanonicalGroupLimited.Ubuntu22.04LTS_79rhkp1fndgsc\\LocalState\\ext4.vhdx'],
      ['Ubuntu', false, 'C:\\Users\\admin\\AppData\\Local\\Packages\\CanonicalGroupLimited.UbuntuonWindows_79rhkp1fndgsc\\LocalState\\ext4.vhdx'],
    ],
  );
});

test('parseLxssJson: 日本語パス、\\\\?\\ 接頭辞、VhdFileName、WSL1 の除外', () => {
  const json = JSON.stringify({
    DefaultDistribution: '{B}',
    Distros: [
      { Id: '{A}', DistributionName: 'Ubuntu', BasePath: 'C:\\Users\\小林\\AppData\\Local\\wsl\\{A}', VhdFileName: null, Version: 2 },
      { Id: '{b}', DistributionName: 'Imported', BasePath: '\\\\?\\D:\\wsl\\imported', VhdFileName: 'disk.vhdx', Version: 2 },
      { Id: '{C}', DistributionName: 'Legacy', BasePath: 'C:\\legacy', VhdFileName: null, Version: 1 },
      { Id: '{D}', DistributionName: null, BasePath: null, VhdFileName: null, Version: null },
    ],
  });
  assert.deepEqual(
    parseLxssJson(json).map((d) => [d.name, d.isDefault, d.vhdPath]),
    [
      ['Ubuntu', false, 'C:\\Users\\小林\\AppData\\Local\\wsl\\{A}\\ext4.vhdx'],
      ['Imported', true, 'D:\\wsl\\imported\\disk.vhdx'],
    ],
  );
});

test('parseLxssJson: ディストロが無い', () => {
  assert.deepEqual(parseLxssJson('{"DefaultDistribution":null,"Distros":[]}'), []);
});

test('decodeWinOutput: UTF-16LE と UTF-8 の両方', () => {
  assert.equal(decodeWinOutput(Buffer.from('Ubuntu-22.04\r\n', 'utf16le')), 'Ubuntu-22.04\n');
  assert.equal(decodeWinOutput(Buffer.from('\uFEFFUbuntu (既定)\r\n', 'utf16le')), 'Ubuntu (既定)\n');
  assert.equal(decodeWinOutput(Buffer.from('Ubuntu (既定)\r\n', 'utf8')), 'Ubuntu (既定)\n');
});

test('parseDfUsed', () => {
  assert.equal(parseDfUsed('     Used\n38654705664\n'), 38654705664);
  assert.equal(parseDfUsed('df: error'), undefined);
});

test('parseWslConfigSwapFile', () => {
  assert.equal(parseWslConfigSwapFile('[wsl2]\nmemory=4GB\nswapFile=C:\\\\temp\\\\swap.vhdx\n'), 'C:\\temp\\swap.vhdx');
  assert.equal(parseWslConfigSwapFile('[wsl2]\nswapfile = "D:\\\\s.vhdx" # comment'), 'D:\\s.vhdx');
  assert.equal(parseWslConfigSwapFile('[experimental]\nswapFile=C:\\\\x.vhdx'), undefined, '別セクションは無視');
  assert.equal(parseWslConfigSwapFile(''), undefined);
});

test('formatBytes / daysSince', () => {
  assert.equal(formatBytes(47153414144), '43.9GB');
  assert.equal(formatBytes(37748736), '36MB');
  assert.equal(daysSince(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-27T12:00:00Z')), 26);
});
