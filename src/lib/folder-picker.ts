import 'server-only';

import {execFile} from 'node:child_process';
import os from 'node:os';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Opens the operating system's own folder chooser and returns the path picked.
 *
 * A browser cannot do this. `showDirectoryPicker()` hands back a sandboxed
 * handle and deliberately never reveals an absolute path, and the server is the
 * side that has to write files — so the dialog is opened by the server process
 * instead. That only makes sense because this app is localhost-only and the
 * server and the person clicking are the same machine.
 */

export interface PickResult {
  /** The chosen path, or null when the dialog was cancelled. */
  path: string | null;
  /** Set when no picker could be shown at all; the UI falls back to typing. */
  unsupported?: string;
}

const CANCELLED = '__WELDAM_CANCELLED__';

export async function pickFolder(startFrom?: string): Promise<PickResult> {
  switch (process.platform) {
    case 'win32':
      return pickFolderWindows(startFrom);
    case 'darwin':
      return pickFolderMac(startFrom);
    default:
      return {
        path: null,
        unsupported: `No folder chooser is wired up for ${process.platform}. Type or paste the path instead.`,
      };
  }
}

async function pickFolderWindows(startFrom?: string): Promise<PickResult> {
  // -STA is required: FolderBrowserDialog is a single-threaded-apartment COM
  // control and silently fails to show without it.
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choose the folder where Weldam House files full-resolution originals'
$dialog.ShowNewFolderButton = $true
${startFrom ? `$dialog.SelectedPath = ${quotePowerShell(startFrom)}` : ''}
# Parent it to a topmost dummy window, otherwise the dialog can open behind the
# browser and look like nothing happened.
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
} else {
  Write-Output '${CANCELLED}'
}
$owner.Dispose()
`.trim();

  const {stdout} = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      windowsHide: true,
      // Generous: the dialog sits open until the user decides.
      timeout: 5 * 60 * 1000,
      maxBuffer: 1024 * 64,
    },
  );

  return readPickerOutput(stdout);
}

async function pickFolderMac(startFrom?: string): Promise<PickResult> {
  const script = `
try
  set chosen to choose folder with prompt "Choose the folder where Weldam House files full-resolution originals"${
    startFrom ? ` default location POSIX file ${JSON.stringify(startFrom)}` : ''
  }
  POSIX path of chosen
on error number -128
  return "${CANCELLED}"
end try
`.trim();

  const {stdout} = await execFileAsync('osascript', ['-e', script], {
    timeout: 5 * 60 * 1000,
    maxBuffer: 1024 * 64,
  });

  return readPickerOutput(stdout);
}

function readPickerOutput(stdout: string): PickResult {
  const chosen = stdout.trim();
  if (!chosen || chosen === CANCELLED) return {path: null};
  return {path: chosen};
}

/** Single-quoted PowerShell literal; a quote inside is escaped by doubling it. */
function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** A sensible place for the dialog to open when nothing is configured yet. */
export function pickerStartDirectory(current: string): string {
  return current || os.homedir();
}
