import 'server-only';

import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';

/**
 * Opens a folder in the machine's own file manager.
 *
 * This exists because a web page cannot hand real files to another web page.
 * Dragging an image out of a browser tab gives the receiving page a URL, not a
 * File — `dataTransfer.files` arrives empty — so a marketplace uploader ignores
 * it. The nearest thing that actually works is putting Explorer on screen at
 * the right folder, one click instead of four, and dragging from there.
 *
 * Same justification as folder-picker.ts: only sane because the server and the
 * person clicking are the same machine.
 */

/** Never takes a path from the browser — callers resolve one from the archive root. */
export async function revealFolder(target: string): Promise<void> {
  await fs.access(target);

  const [command, args] = revealCommand(target);

  // Detached, with the exit code ignored on purpose: explorer.exe exits 1 even
  // when it opened the window perfectly well, and none of these tell us
  // anything we did not already learn from the fs.access above.
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.on('error', (error) => {
    console.warn(`[reveal] ${command} failed:`, error.message);
  });
  child.unref();
}

function revealCommand(target: string): [string, string[]] {
  switch (process.platform) {
    case 'win32':
      return ['explorer.exe', [target]];
    case 'darwin':
      return ['open', [target]];
    default:
      return ['xdg-open', [target]];
  }
}
