import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DistroEntry, parseDfUsed, queryDistros } from './win/distro';
import { listRunningDistros, runInDistro } from './win/exec';
import { findSwapFiles, SwapFile } from './win/swap';

/** ある時点のディストロと swap.vhdx の状態。ステータスバー、詳細表示、圧縮の前後比較に使う。 */

export interface DistroInfo extends DistroEntry {
  /** vhdx のファイルサイズ。vhdx が見つからなければ undefined。 */
  size?: number;
  /** vhdx の最終更新日時。長く使われていないディストロの判定に使う。 */
  mtime?: Date;
  running: boolean;
  /** Linux 内の使用量。起動中のディストロで withLinuxUsage のときだけ取る。 */
  linuxUsed?: number;
}

export interface Snapshot {
  distros: DistroInfo[];
  /** 対象のディストロ（設定 compactWsl.distro、空なら既定のディストロ）。見つからなければ undefined。 */
  target?: DistroInfo;
  swaps: SwapFile[];
}

/**
 * 状態を調べる。WSL を起動することはない（Linux 内の使用量は、起動中のディストロだけ調べる）。
 * @param targetName 対象のディストロ名。空なら既定のディストロ。
 */
export async function takeSnapshot(targetName: string, opts: { withLinuxUsage?: boolean } = {}): Promise<Snapshot> {
  const [entries, running] = await Promise.all([queryDistros(), listRunningDistros()]);

  const distros = await Promise.all(
    entries.map(async (e): Promise<DistroInfo> => {
      const info: DistroInfo = { ...e, running: running.includes(e.name) };
      try {
        const st = await fs.stat(e.vhdPath);
        info.size = st.size;
        info.mtime = st.mtime;
      } catch {
        // vhdx が見つからない
      }
      if (opts.withLinuxUsage && info.running) {
        const r = await runInDistro(e.name, 'df -B1 --output=used /');
        info.linuxUsed = r.code === 0 ? parseDfUsed(r.stdout) : undefined;
      }
      return info;
    }),
  );

  const target = targetName ? distros.find((d) => d.name === targetName) : distros.find((d) => d.isDefault);
  const tempDir = process.env.TEMP ?? os.tmpdir();
  const swaps = await findSwapFiles(tempDir, path.join(os.homedir(), '.wslconfig'));

  return { distros, target, swaps };
}
