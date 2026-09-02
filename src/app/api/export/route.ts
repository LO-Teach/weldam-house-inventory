import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError} from '@/src/lib/http';
import {listItems} from '@/src/lib/items';
import {listItemsQuerySchema} from '@/src/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS = [
  'lot_number',
  'title_nl',
  'title_en',
  'shopify_category',
  'material',
  'material_detail',
  'colour',
  'colour_detail',
  'style',
  'era',
  'height_cm',
  'width_cm',
  'depth_cm',
  'diameter_cm',
  'weight_g',
  'dimensions_cm',
  'maker',
  'marks_found',
  'marks_to_check',
  'condition_grade',
  'condition',
  'confidence',
  'retail_local',
  'ask_local',
  'floor_local',
  'retail_intl',
  'ask_intl',
  'floor_intl',
  'channel',
  'lot_group',
  'status',
  'listed_at',
  'owner_name',
  'owner_contact',
  'owner_split_pct',
  'sold_price',
  'sold_at',
  'notes',
  'archive_folder',
  'created_at',
] as const;

/**
 * CSV of the current filter set. Excel opens this by double-click, which is why
 * it gets a UTF-8 BOM and CRLF line endings rather than the tidier bare LF.
 */
export async function GET(request: NextRequest) {
  try {
    const raw = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listItemsQuerySchema.safeParse({...raw, limit: '500', offset: '0'});
    if (!parsed.success) return jsonError('Bad query.');

    const rows: string[] = [COLUMNS.join(',')];
    let offset = 0;

    // Page through rather than asking for everything at once: 500 is the
    // per-request cap and an inventory is expected to outgrow it.
    for (;;) {
      const page = await listItems({...parsed.data, offset});
      for (const item of page.items) {
        rows.push(
          COLUMNS.map((column) => csvCell(item[column] as unknown)).join(','),
        );
      }
      offset += page.items.length;
      if (page.items.length === 0 || offset >= page.total) break;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response('\uFEFF' + rows.join('\r\n') + '\r\n', {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="weldam-inventory-${stamp}.csv"`,
      },
    });
  } catch (error) {
    return handleRouteError('GET /api/export', error);
  }
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
