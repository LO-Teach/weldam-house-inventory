import type {NextRequest} from 'next/server';

import {getSettings, getSupabaseConfig, saveSettings} from '@/src/lib/config';
import {createArchiveRoot, getArchiveStatus} from '@/src/lib/drive';
import {pickFolder, pickerStartDirectory} from '@/src/lib/folder-picker';
import {handleRouteError, jsonError, readJson} from '@/src/lib/http';
import {settingsPatchSchema} from '@/src/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseConfig = getSupabaseConfig();
    return Response.json({
      settings: await getSettings(),
      archive: await getArchiveStatus(),
      // Never the key itself — only whether one is present and which kind.
      supabase: {
        configured: supabaseConfig !== null,
        url: supabaseConfig?.url ?? null,
        bucket: supabaseConfig?.bucket ?? null,
        keyKind: supabaseConfig
          ? supabaseConfig.isServiceRole
            ? 'service_role'
            : 'publishable'
          : null,
      },
      appraisal: {
        model: process.env.APPRAISAL_MODEL?.trim() || 'claude-opus-5',
        auth: process.env.ANTHROPIC_API_KEY?.trim()
          ? 'api_key'
          : 'claude_code_subscription',
      },
      platform: process.platform,
    });
  } catch (error) {
    return handleRouteError('GET /api/settings', error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = settingsPatchSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return jsonError(
        `Invalid settings: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    }
    const settings = await saveSettings(parsed.data);
    return Response.json({settings, archive: await getArchiveStatus()});
  } catch (error) {
    return handleRouteError('PATCH /api/settings', error);
  }
}

/**
 * Two actions the Settings screen needs that a browser cannot do for itself:
 *
 *   pick   — opens the OS folder chooser on this machine and returns the path.
 *            The File System Access API deliberately hides absolute paths, and
 *            the server is the side that writes files, so the dialog is opened
 *            server-side. Only reasonable because this is localhost-only.
 *   create — makes the archive folder. Explicit click only; ingest never
 *            creates a missing archive root behind your back.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as {action?: string; path?: string};
    const settings = await getSettings();

    if (body.action === 'pick') {
      const result = await pickFolder(
        pickerStartDirectory(body.path?.trim() || settings.archiveRoot),
      );
      return Response.json(result);
    }

    if (body.action === 'create') {
      const target = body.path?.trim() || settings.archiveRoot;
      if (!target) return jsonError('No folder path given.');
      const archive = await createArchiveRoot(target);
      return Response.json({archive});
    }

    return jsonError(`Unknown action ${JSON.stringify(body.action)}.`);
  } catch (error) {
    return handleRouteError('POST /api/settings', error);
  }
}
