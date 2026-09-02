import {handleRouteError} from '@/src/lib/http';
import {listCategories, listLotGroups, listOwners} from '@/src/lib/items';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Distinct values that populate the filter bar and the lot-group combobox. */
export async function GET() {
  try {
    const [categories, lotGroups, owners] = await Promise.all([
      listCategories(),
      listLotGroups(),
      listOwners(),
    ]);
    return Response.json({categories, lotGroups, owners});
  } catch (error) {
    return handleRouteError('GET /api/meta', error);
  }
}
