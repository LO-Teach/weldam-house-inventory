-- ---------------------------------------------------------------------------
-- 1. The price ladder: three numbers per market instead of one.
--    retail = consumer price, ask = 80% of it, floor = where markdown stops.
-- ---------------------------------------------------------------------------
alter table public.items
  add column retail_local numeric(10,2),
  add column ask_local    numeric(10,2),
  add column floor_local  numeric(10,2),
  add column retail_intl  numeric(10,2),
  add column ask_intl     numeric(10,2),
  add column floor_intl   numeric(10,2),
  -- When the markdown clock started. Set on the transition into 'listed'.
  add column listed_at    timestamptz;

-- Carry the old single price across as the asking price, and back-fill a
-- retail estimate from it so nothing reads as zero while waiting to be
-- re-appraised.
update public.items
   set ask_local    = price_local,
       retail_local = case when price_local is not null
                           then round(price_local / 0.8, 2) end,
       floor_local  = case when price_local is not null
                           then round(price_local * 0.5, 2) end,
       ask_intl     = price_intl,
       retail_intl  = case when price_intl is not null
                           then round(price_intl / 0.8, 2) end,
       floor_intl   = case when price_intl is not null
                           then round(price_intl * 0.5, 2) end;

alter table public.items drop column price_local;
alter table public.items drop column price_intl;

-- ---------------------------------------------------------------------------
-- 2. Shopify-grade categorisation.
--    Two layers on purpose: the enum drives storefront filters, the *_detail
--    column keeps the precision that actually sets the price. Shopify has no
--    "lead crystal" or "silver plate"; collapsing to Glass/Metal alone would
--    throw away the most valuable word on the item.
-- ---------------------------------------------------------------------------
alter table public.items
  add column shopify_category text,   -- e.g. 'hg-3-67' (Vases)
  add column material_detail  text,   -- 'lead crystal', 'sommerso cased glass'
  add column colour_detail    text,   -- 'amber over clear'
  add column style            text,   -- 'Mid-century modern'
  add column condition_grade  text
       check (condition_grade in
              ('mint','excellent','good','fair','poor','restoration project'));

-- ---------------------------------------------------------------------------
-- 3. Real dimensions, so the storefront can filter by size and the
--    international price can account for what it costs to post.
-- ---------------------------------------------------------------------------
alter table public.items
  add column height_cm   numeric(8,1),
  add column width_cm    numeric(8,1),
  add column depth_cm    numeric(8,1),
  add column diameter_cm numeric(8,1),
  add column weight_g    integer;

-- ---------------------------------------------------------------------------
-- 4. Consignment. Selling on behalf of family and friends is the normal case
--    for an estate clearer, and "whose was this again?" is not a question the
--    books should have to guess at months later.
-- ---------------------------------------------------------------------------
alter table public.items
  add column owner_name      text not null default 'Weldam House',
  add column owner_contact   text,
  add column owner_split_pct numeric(5,2),
  add column owner_notes     text;

-- ---------------------------------------------------------------------------
-- 5. The folder on disk. Named with the title once it has one, so the archive
--    is browsable without the app; tracked here because renaming it moves
--    every archive_path underneath it.
-- ---------------------------------------------------------------------------
alter table public.items add column archive_folder text;

update public.items
   set archive_folder = lpad(lot_number::text, 4, '0')
 where archive_folder is null;

create index on public.items (shopify_category);
create index on public.items (material);
create index on public.items (style);
create index on public.items (owner_name);
create index on public.items (listed_at);
