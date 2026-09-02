/**
 * Controlled vocabularies for the shop.
 *
 * Everything here is aimed at one thing: a Shopify storefront where a customer
 * can filter by product type, material, colour, style and size. That only works
 * if those fields come out of a fixed list rather than the appraiser's
 * imagination — "brass", "Brass", "gepolijst messing" and "brass/gilt" are four
 * facets for one material.
 *
 * The category IDs and the material/colour values below are REAL Shopify
 * taxonomy values, taken from Shopify/product-taxonomy. They are deliberately a
 * curated subset: the full tree is 14,609 categories, and a model given all of
 * them picks oddly specific leaves that make useless filters.
 *
 * Add to these lists freely when something new walks through the door — they
 * are just arrays, and widening one is a one-line change.
 */

export interface ShopifyCategory {
  /** Shopify taxonomy id, e.g. 'hg-3-67'. Maps to gid://shopify/TaxonomyCategory/<id>. */
  id: string;
  /** Short label for the UI and for the appraiser to choose from. */
  label: string;
  /** Full Shopify path, for the eventual product export. */
  path: string;
  /** Grouping for the filter menu. Not part of Shopify's taxonomy. */
  group: string;
}

export const SHOPIFY_CATEGORIES: ShopifyCategory[] = [
  // --- Decorative objects -------------------------------------------------
  {id: 'hg-3-67', label: 'Vase', path: 'Home & Garden > Decor > Vases', group: 'Decorative'},
  {id: 'hg-3-21', label: 'Decorative bowl', path: 'Home & Garden > Decor > Decorative Bowls', group: 'Decorative'},
  {id: 'hg-3-24', label: 'Decorative plate', path: 'Home & Garden > Decor > Decorative Plates', group: 'Decorative'},
  {id: 'hg-3-25', label: 'Decorative tray', path: 'Home & Garden > Decor > Decorative Trays', group: 'Decorative'},
  {id: 'hg-3-22', label: 'Decorative jar', path: 'Home & Garden > Decor > Decorative Jars', group: 'Decorative'},
  {id: 'hg-19-1', label: 'Ashtray', path: 'Home & Garden > Smoking Accessories > Ashtrays', group: 'Decorative'},
  {id: 'hg-3-30', label: 'Figurine', path: 'Home & Garden > Decor > Figurines', group: 'Decorative'},
  {id: 'hg-3-4-3', label: 'Sculpture', path: 'Home & Garden > Decor > Artwork > Sculptures & Statues', group: 'Decorative'},
  {id: 'hg-3-12', label: 'Bookends', path: 'Home & Garden > Decor > Bookends', group: 'Decorative'},
  {id: 'hg-3-48', label: 'Music box', path: 'Home & Garden > Decor > Music Boxes', group: 'Decorative'},

  // --- Lighting and candles ------------------------------------------------
  {id: 'hg-3-39-2', label: 'Candle holder', path: 'Home & Garden > Decor > Home Fragrance Accessories > Candle Holders', group: 'Lighting'},
  {id: 'hg-3-39-4', label: 'Incense holder', path: 'Home & Garden > Decor > Home Fragrance Accessories > Incense Holders', group: 'Lighting'},
  {id: 'hg-13-5-5', label: 'Table lamp', path: 'Home & Garden > Lighting > Lamps > Table Lamps', group: 'Lighting'},
  {id: 'hg-13-5-3', label: 'Floor lamp', path: 'Home & Garden > Lighting > Lamps > Floor Lamps', group: 'Lighting'},
  {id: 'hg-13-9-3', label: 'Chandelier / pendant', path: 'Home & Garden > Lighting > Lighting Fixtures > Chandeliers', group: 'Lighting'},
  {id: 'hg-14-3', label: 'Lamp shade', path: 'Home & Garden > Lighting Accessories > Lamp Shades', group: 'Lighting'},

  // --- Table and barware ---------------------------------------------------
  {id: 'hg-11-10-7-14', label: 'Serving bowl', path: 'Home & Garden > Kitchen & Dining > Tableware > Serveware > Serving Bowls', group: 'Tableware'},
  {id: 'hg-11-10-7-8', label: 'Serving platter', path: 'Home & Garden > Kitchen & Dining > Tableware > Serveware > Serving Platters', group: 'Tableware'},
  {id: 'hg-11-10-7-3', label: 'Cake stand', path: 'Home & Garden > Kitchen & Dining > Tableware > Serveware > Cake Stands', group: 'Tableware'},
  {id: 'hg-11-10-7-1', label: 'Butter dish', path: 'Home & Garden > Kitchen & Dining > Tableware > Serveware > Butter Dishes', group: 'Tableware'},
  {id: 'hg-11-10-7-5', label: 'Gravy boat', path: 'Home & Garden > Kitchen & Dining > Tableware > Serveware > Gravy Boats', group: 'Tableware'},
  {id: 'hg-11-10-7-10-1', label: 'Sugar bowl / creamer', path: 'Home & Garden > Kitchen & Dining > Tableware > Serveware > Sugar Bowls & Creamers > Sugar Bowls', group: 'Tableware'},
  {id: 'hg-11-10-4-1', label: 'Bowl (dinnerware)', path: 'Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Bowls', group: 'Tableware'},
  {id: 'hg-11-10-4-3', label: 'Plate (dinnerware)', path: 'Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Plates', group: 'Tableware'},
  {id: 'hg-11-10-2-2', label: 'Teapot', path: 'Home & Garden > Kitchen & Dining > Tableware > Coffee Servers & Teapots > Teapots', group: 'Tableware'},
  {id: 'hg-11-10-2-1', label: 'Coffee server', path: 'Home & Garden > Kitchen & Dining > Tableware > Coffee Servers & Teapots > Coffee Servers', group: 'Tableware'},
  {id: 'hg-11-10-5-5', label: 'Mug / cup', path: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs', group: 'Tableware'},
  {id: 'hg-11-10-5-7-3', label: 'Wine glass / stemware', path: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Stemware > Wine Glasses', group: 'Tableware'},
  {id: 'hg-11-10-5-8', label: 'Tumbler', path: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Tumblers', group: 'Tableware'},
  {id: 'hg-11-1-12', label: 'Decanter', path: 'Home & Garden > Kitchen & Dining > Barware > Decanters', group: 'Tableware'},
  {id: 'hg-11-10-10', label: 'Trivet', path: 'Home & Garden > Kitchen & Dining > Tableware > Trivets', group: 'Tableware'},
  {id: 'hg-3-49', label: 'Napkin rings', path: 'Home & Garden > Decor > Napkin Rings', group: 'Tableware'},

  // --- Wall and art --------------------------------------------------------
  {id: 'hg-3-47', label: 'Mirror', path: 'Home & Garden > Decor > Mirrors', group: 'Wall & art'},
  {id: 'hg-3-52', label: 'Picture frame', path: 'Home & Garden > Decor > Picture Frames', group: 'Wall & art'},
  {id: 'hg-3-4-2-4', label: 'Painting', path: 'Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork > Paintings', group: 'Wall & art'},
  {id: 'hg-3-4-2-2', label: 'Print', path: 'Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork > Prints', group: 'Wall & art'},
  {id: 'hg-3-4-1', label: 'Tapestry', path: 'Home & Garden > Decor > Artwork > Decorative Tapestries', group: 'Wall & art'},
  {id: 'hg-3-17', label: 'Clock', path: 'Home & Garden > Decor > Clocks', group: 'Wall & art'},
  {id: 'hg-3-17-4', label: 'Wall clock', path: 'Home & Garden > Decor > Clocks > Wall Clocks', group: 'Wall & art'},

  // --- Furniture -----------------------------------------------------------
  {id: 'fr-7', label: 'Chair', path: 'Furniture > Chairs', group: 'Furniture'},
  {id: 'fr-24', label: 'Table', path: 'Furniture > Tables', group: 'Furniture'},
  {id: 'fr-24-1-1', label: 'Coffee table', path: 'Furniture > Tables > Accent Tables > Coffee Tables', group: 'Furniture'},
  {id: 'fr-24-1-2', label: 'Side / end table', path: 'Furniture > Tables > Accent Tables > End Tables', group: 'Furniture'},
  {id: 'fr-4', label: 'Cabinet / storage', path: 'Furniture > Cabinets & Storage', group: 'Furniture'},
  {id: 'fr-4-11', label: 'Sideboard', path: 'Furniture > Cabinets & Storage > Sideboards', group: 'Furniture'},
  {id: 'fr-4-5', label: 'Dresser', path: 'Furniture > Cabinets & Storage > Dressers', group: 'Furniture'},
  {id: 'fr-4-16', label: 'Wine rack', path: 'Furniture > Cabinets & Storage > Wine Racks', group: 'Furniture'},
  {id: 'fr-3', label: 'Bench', path: 'Furniture > Benches', group: 'Furniture'},
  {id: 'fr-14', label: 'Ottoman / stool', path: 'Furniture > Ottomans', group: 'Furniture'},

  // --- Textiles ------------------------------------------------------------
  {id: 'hg-3-57', label: 'Rug', path: 'Home & Garden > Decor > Rugs', group: 'Textiles'},
  {id: 'hg-15-1-4', label: 'Blanket / throw', path: 'Home & Garden > Linens & Bedding > Bedding > Blankets', group: 'Textiles'},

  // --- Storage and containers ---------------------------------------------
  {id: 'hg-3-6', label: 'Basket', path: 'Home & Garden > Decor > Baskets', group: 'Storage'},
  {id: 'hg-3-65', label: 'Trunk / chest', path: 'Home & Garden > Decor > Trunks', group: 'Storage'},
  {id: 'lb-12', label: 'Suitcase', path: 'Luggage & Bags > Suitcases', group: 'Storage'},
  {id: 'hb-2-3-1', label: 'Jewellery box', path: 'Health & Beauty > Jewelry Cleaning & Care > Jewelry Holders > Jewelry Boxes', group: 'Storage'},

  // --- Jewellery and personal ---------------------------------------------
  {id: 'aa-6-8', label: 'Necklace', path: 'Apparel & Accessories > Jewelry > Necklaces', group: 'Jewellery'},
  {id: 'aa-6-3', label: 'Bracelet', path: 'Apparel & Accessories > Jewelry > Bracelets', group: 'Jewellery'},
  {id: 'aa-6-4-1', label: 'Brooch', path: 'Apparel & Accessories > Jewelry > Brooches & Lapel Pins > Brooches', group: 'Jewellery'},
  {id: 'aa-6-6', label: 'Earrings', path: 'Apparel & Accessories > Jewelry > Earrings', group: 'Jewellery'},
  {id: 'aa-6-9', label: 'Ring', path: 'Apparel & Accessories > Jewelry > Rings', group: 'Jewellery'},
  {id: 'aa-6-11', label: 'Watch', path: 'Apparel & Accessories > Jewelry > Watches', group: 'Jewellery'},
  {id: 'aa-5-4', label: 'Handbag', path: 'Apparel & Accessories > Handbags, Wallets & Cases > Handbags', group: 'Jewellery'},

  // --- Technical and collectible ------------------------------------------
  {id: 'el-2-3-7', label: 'Radio', path: 'Electronics > Audio > Audio Players & Recorders > Radios', group: 'Collectible'},
  {id: 'el-2-3-10-2', label: 'Turntable', path: 'Electronics > Audio > Audio Players & Recorders > Turntables & Record Players > Turntables', group: 'Collectible'},
  {id: 'co-2', label: 'Camera', path: 'Cameras & Optics > Cameras', group: 'Collectible'},
  {id: 'co-3-1', label: 'Binoculars', path: 'Cameras & Optics > Optics > Binoculars', group: 'Collectible'},
  {id: 'me-1', label: 'Book', path: 'Media > Books', group: 'Collectible'},

  // --- Fallback ------------------------------------------------------------
  {id: 'other', label: 'Other / uncategorised', path: 'Other', group: 'Other'},
];

export const CATEGORY_IDS = SHOPIFY_CATEGORIES.map((c) => c.id);

export function categoryById(id: string | null | undefined): ShopifyCategory | null {
  if (!id) return null;
  return SHOPIFY_CATEGORIES.find((c) => c.id === id) ?? null;
}

export function categoryLabel(id: string | null | undefined): string {
  return categoryById(id)?.label ?? '—';
}

/**
 * Shopify's own Material attribute values, narrowed to the ones an estate
 * clearance actually produces. Every string here is a valid Shopify value, so
 * the eventual product export needs no mapping table.
 *
 * NOTE the gap: Shopify has no "Crystal", "Silver", "Silver plate" or "Pewter".
 * Lead crystal is `Glass`, silver and pewter are `Metal` — and the precise word
 * goes in `material_detail`, which is what actually sets the price. Do not
 * invent values to work around this; the storefront filter depends on these
 * being real Shopify values.
 */
export const MATERIALS = [
  'Glass',
  'Ceramic',
  'Porcelain',
  'Clay',
  'Stone',
  'Marble',
  'Concrete',
  'Wood',
  'Plywood',
  'Bamboo',
  'Rattan',
  'Cork',
  'Metal',
  'Brass',
  'Bronze',
  'Copper',
  'Iron',
  'Aluminum',
  'Chrome',
  'Stainless steel',
  'Leather',
  'Faux leather',
  'Suede',
  'Fabric',
  'Cotton',
  'Linen',
  'Wool',
  'Silk',
  'Velvet',
  'Jute',
  'Canvas',
  'Felt',
  'Paper',
  'Cardboard',
  'Plastic',
  'Acrylic',
  'Resin',
  'Rubber',
  'Fiberglass',
  'Other',
] as const;
export type Material = (typeof MATERIALS)[number];

/** Shopify's Color attribute, complete. Nineteen values is already tight. */
export const COLOURS = [
  'Beige',
  'Black',
  'Blue',
  'Bronze',
  'Brown',
  'Clear',
  'Gold',
  'Gray',
  'Green',
  'Multicolor',
  'Navy',
  'Orange',
  'Pink',
  'Purple',
  'Red',
  'Rose gold',
  'Silver',
  'White',
  'Yellow',
] as const;
export type Colour = (typeof COLOURS)[number];

/**
 * Period and movement. Not a Shopify attribute — this is a vintage-trade facet,
 * and one of the strongest filters a decor shop can offer, because people shop
 * by look far more than by decade.
 */
export const STYLES = [
  'Art Nouveau',
  'Art Deco',
  'Bauhaus',
  'Mid-century modern',
  'Scandinavian',
  'Space Age',
  'Brutalist',
  'Postmodern',
  'Memphis',
  'Victorian',
  'Edwardian',
  'Baroque',
  'Rococo',
  'Empire',
  'Arts and Crafts',
  'Industrial',
  'Rustic / folk',
  'Oriental',
  'Contemporary',
  'Unknown',
] as const;
export type Style = (typeof STYLES)[number];

/**
 * A graded condition instead of prose. The appraiser still writes the specific
 * damage into `condition`; this is the number that drives price and lets a
 * buyer filter.
 */
export const CONDITIONS = [
  'mint',
  'excellent',
  'good',
  'fair',
  'poor',
  'restoration project',
] as const;
export type ConditionGrade = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<ConditionGrade, string> = {
  mint: 'Mint — as new, no wear',
  excellent: 'Excellent — barely used, no damage',
  good: 'Good — light age wear, no damage',
  fair: 'Fair — visible wear or a small flaw',
  poor: 'Poor — significant damage',
  'restoration project': 'Restoration project',
};
