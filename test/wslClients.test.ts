import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { classifyWslProcesses } from '../src/win/wslClients';

// 開発機で Remote-WSL のウィンドウを 1 つ開いていたときの wsl.exe（CommandLine は抜粋）
const VSCODE_WINDOW = [
  { ProcessId: 10632, ParentProcessId: 4264, CommandLine: 'wsl.exe -d Ubuntu-22.04 sh -c \'"$VSCODE_WSL_EXT_LOCATION/scripts/wslServer.sh" ... .vscode-server --host=127.0.0.1\'' },
  { ProcessId: 8460, ParentProcessId: 10632, CommandLine: 'wsl.exe -d Ubuntu-22.04 sh -c \'... .vscode-server ...\'' },
  { ProcessId: 11028, ParentProcessId: 8460, CommandLine: 'wsl.exe -d Ubuntu-22.04 sh -c \'... .vscode-server ...\'' },
  { ProcessId: 5564, ParentProcessId: 4264, CommandLine: 'wsl.exe -d Ubuntu-22.04 -e /home/wsl/.vscode-server/bin/xxx/node -e "..."' },
  { ProcessId: 5140, ParentProcessId: 5564, CommandLine: 'wsl.exe -d Ubuntu-22.04 -e /home/wsl/.vscode-server/bin/xxx/node -e "..."' },
];

test('classifyWslProcesses: 何も無い', () => {
  assert.deepEqual(classifyWslProcesses([]), { vscode: false, others: 0 });
});

test('classifyWslProcesses: VS Code の WSL ウィンドウ', () => {
  assert.deepEqual(classifyWslProcesses(VSCODE_WINDOW), { vscode: true, others: 0 });
});

test('classifyWslProcesses: ターミナルは入れ子を数えず根だけ数える', () => {
  const terminal = [
    { ProcessId: 100, ParentProcessId: 1, CommandLine: 'C:\\WINDOWS\\system32\\wsl.exe -d Ubuntu-22.04' },
    { ProcessId: 101, ParentProcessId: 100, CommandLine: 'wsl.exe -d Ubuntu-22.04' },
    { ProcessId: 200, ParentProcessId: 2, CommandLine: null },
  ];
  assert.deepEqual(classifyWslProcesses([...VSCODE_WINDOW, ...terminal]), { vscode: true, others: 2 });
});
