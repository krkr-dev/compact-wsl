import * as vscode from 'vscode';

/** package.json の contributes.configuration と対応する設定値。 */
export interface Config {
  /** 対象のディストロ名。空なら既定のディストロ。 */
  distro: string;
  /** vhdx がこのサイズ (GB) 以上になったらステータスバーを警告色にする。 */
  warnThresholdGB: number;
  /** vhdx のサイズを測る間隔 (分)。 */
  pollIntervalMinutes: number;
}

export const CONFIG_SECTION = 'compactWsl';

export function getConfig(): Config {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    distro: c.get<string>('distro', ''),
    warnThresholdGB: c.get<number>('warnThresholdGB', 50),
    pollIntervalMinutes: c.get<number>('pollIntervalMinutes', 5),
  };
}
