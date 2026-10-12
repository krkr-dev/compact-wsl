import { runPowerShell } from './exec';

export interface WinProcess {
  ProcessId: number;
  ParentProcessId: number;
  CommandLine: string | null;
}

export interface WslClients {
  /** VS Code の WSL ウィンドウ（vscode-server への接続）があるか */
  vscode: boolean;
  /** それ以外で WSL を使っているもの（ターミナルなど）の数 */
  others: number;
}

/**
 * wsl.exe のプロセス一覧から、WSL を使っているものを分類する。
 * 1 つの接続が wsl.exe を入れ子で起動するので、親が wsl.exe でないもの（根）だけを数える。
 */
export function classifyWslProcesses(procs: WinProcess[]): WslClients {
  const ids = new Set(procs.map((p) => p.ProcessId));
  const roots = procs.filter((p) => !ids.has(p.ParentProcessId));
  const isVscode = (p: WinProcess) => (p.CommandLine ?? '').includes('.vscode-server');
  return {
    vscode: roots.some(isVscode),
    others: roots.filter((p) => !isVscode(p)).length,
  };
}

/** 今 WSL を使っている（WSL を起動し直す可能性がある）プロセスを調べる。 */
export async function findWslClients(): Promise<WslClients> {
  const r = await runPowerShell(
    "ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter \"Name='wsl.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine)",
  );
  if (r.code !== 0) {
    throw new Error(`wsl.exe のプロセスを調べられませんでした: ${r.stderr.trim()}`);
  }
  const text = r.stdout.trim();
  return classifyWslProcesses(text ? (JSON.parse(text) as WinProcess[]) : []);
}
