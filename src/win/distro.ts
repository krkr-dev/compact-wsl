import * as path from 'node:path';
import { runPowerShell } from './exec';

export interface DistroEntry {
  id: string;
  name: string;
  basePath: string;
  vhdPath: string;
  isDefault: boolean;
}

/** LXSS_SCRIPT が出力する JSON の形 */
interface LxssJson {
  DefaultDistribution: string | null;
  Distros: {
    Id: string;
    DistributionName: string | null;
    BasePath: string | null;
    VhdFileName: string | null;
    Version: number | null;
  }[];
}

// HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss（WSL がディストロを登録する場所）を JSON で出力する
const LXSS_SCRIPT = [
  "$k = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss'",
  '$def = (Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).DefaultDistribution',
  '$ds = @(Get-ChildItem -Path $k -ErrorAction SilentlyContinue | ForEach-Object {' +
    ' $p = Get-ItemProperty -Path $_.PSPath;' +
    ' [pscustomobject]@{ Id = $_.PSChildName; DistributionName = $p.DistributionName; BasePath = $p.BasePath; VhdFileName = $p.VhdFileName; Version = $p.Version } })',
  'ConvertTo-Json -Compress -Depth 3 -InputObject @{ DefaultDistribution = $def; Distros = $ds }',
].join('; ');

/** LXSS_SCRIPT の出力を解析する。 */
export function parseLxssJson(text: string): DistroEntry[] {
  const json = JSON.parse(text) as LxssJson;
  const defaultId = (json.DefaultDistribution ?? '').toLowerCase();
  const result: DistroEntry[] = [];
  for (const d of json.Distros ?? []) {
    if (!d.DistributionName || !d.BasePath) {
      continue;
    }
    // WSL1 は vhdx を持たないので対象外
    if (d.Version !== null && d.Version !== undefined && d.Version !== 2) {
      continue;
    }
    const basePath = d.BasePath.replace(/^\\\\\?\\/, '');
    result.push({
      id: d.Id,
      name: d.DistributionName,
      basePath,
      vhdPath: path.win32.join(basePath, d.VhdFileName || 'ext4.vhdx'),
      isDefault: d.Id.toLowerCase() === defaultId,
    });
  }
  return result;
}

/** `df -B1 --output=used /` の出力から使用バイト数を取り出す。 */
export function parseDfUsed(text: string): number | undefined {
  const lines = text.trim().split('\n');
  const n = Number(lines[lines.length - 1]?.trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function queryDistros(): Promise<DistroEntry[]> {
  const r = await runPowerShell(LXSS_SCRIPT);
  return r.code === 0 && r.stdout.trim() ? parseLxssJson(r.stdout) : [];
}
