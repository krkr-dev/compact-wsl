import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface SwapFile {
  path: string;
  size: number;
}

/**
 * .wslconfig の [wsl2] セクションにある swapFile の値を返す。
 * 値は `C:\\temp\\swap.vhdx` のようにバックスラッシュを二重に書くのが公式の書式。
 */
export function parseWslConfigSwapFile(text: string): string | undefined {
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[#;].*$/, '').trim();
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) {
      section = sec[1].trim().toLowerCase();
      continue;
    }
    if (section !== 'wsl2') {
      continue;
    }
    const kv = /^swapfile\s*=\s*(.+)$/i.exec(line);
    if (kv) {
      return kv[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\\\/g, '\\');
    }
  }
  return undefined;
}

/**
 * WSL が止まっている状態で呼ぶ。消せたファイルと、消せなかったファイルを返す。
 * WSL は正常に止まるときに自分で swap.vhdx を消すことがあるので、すでに無いもの（ENOENT）も消せたものとして扱う。
 */
export async function deleteSwapFiles(files: SwapFile[]): Promise<{ deleted: SwapFile[]; failed: { file: SwapFile; error: string }[] }> {
  const deleted: SwapFile[] = [];
  const failed: { file: SwapFile; error: string }[] = [];
  for (const f of files) {
    try {
      await fs.rm(f.path);
      deleted.push(f);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        deleted.push(f);
      } else {
        failed.push({ file: f, error: String(e) });
      }
    }
  }
  return { deleted, failed };
}

/**
 * swap.vhdx を探す。
 *   - 既定の場所: %TEMP%\<VM の ID>\swap.vhdx（VM を起動するたびに ID が変わるので、%TEMP% 直下の全フォルダを見る）
 *   - .wslconfig の [wsl2] swapFile で場所が指定されていれば、そのパス
 */
export async function findSwapFiles(tempDir: string, wslConfigPath: string): Promise<SwapFile[]> {
  const candidates = new Set<string>();

  try {
    for (const ent of await fs.readdir(tempDir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        candidates.add(path.join(tempDir, ent.name, 'swap.vhdx'));
      }
    }
  } catch {
    // TEMP が読めなくても続ける
  }

  try {
    const custom = parseWslConfigSwapFile(await fs.readFile(wslConfigPath, 'utf8'));
    if (custom) {
      candidates.add(custom);
    }
  } catch {
    // .wslconfig が無いのは普通
  }

  const found: SwapFile[] = [];
  for (const p of candidates) {
    try {
      const st = await fs.stat(p);
      if (st.isFile()) {
        found.push({ path: p, size: st.size });
      }
    } catch {
      // 存在しない
    }
  }
  return found;
}
