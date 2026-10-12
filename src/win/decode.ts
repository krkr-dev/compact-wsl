/**
 * wsl.exe は環境によって UTF-16LE で出力する（WSL_UTF8 が効かない古い版など）。
 * NUL バイトが含まれていれば UTF-16LE とみなしてデコードする。
 */
export function decodeWinOutput(buf: Buffer): string {
  const looksUtf16 = buf.length >= 2 && buf.subarray(0, Math.min(buf.length, 64)).includes(0);
  const text = looksUtf16 ? buf.toString('utf16le') : buf.toString('utf8');
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}
