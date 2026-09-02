import {getArchiveStatus} from '@/src/lib/drive';
import {handleRouteError} from '@/src/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Archive status for the Ingest header. Ingest is disabled unless isReady. */
export async function GET() {
  try {
    return Response.json(await getArchiveStatus());
  } catch (error) {
    return handleRouteError('GET /api/drive', error);
  }
}
