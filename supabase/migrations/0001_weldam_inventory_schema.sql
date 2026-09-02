-- Weldam House Inventory — core schema
-- Applied to project nlkoicvhjuynpsrfoavl (eu-west-1)

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  lot_number     serial unique,
  title_nl       text,
  title_en       text,
  category       text,
  material       text,
  era            text,
  colour         text,
  dimensions_cm  text,
  maker          text,
  marks_found    text,
  marks_to_check text,
  condition      text,
  facts          jsonb,          -- structured appraisal output, source of truth for copy
  price_local    numeric(10,2),
  price_intl     numeric(10,2),
  channel        text default 'local'
                 check (channel in ('local','ebay','catawiki','shopify','lot','hold','scrap')),
  confidence     text check (confidence in ('certain','likely','guessing')),
  lot_group      text,
  status         text default 'draft'
                 check (status in ('draft','appraised','listed','sold','scrapped')),
  sold_price     numeric(10,2),
  sold_at        timestamptz,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table public.item_images (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references public.items(id) on delete cascade,
  storage_path  text not null,        -- derivative in Supabase storage
  archive_path  text,                 -- original on the SSD, relative to ARCHIVE_ROOT
  original_name text,                 -- camera filename, for tracing back
  sha256        text,                 -- checksum of the original, verified on copy
  bytes         integer,              -- size of the original
  is_primary    boolean default false,
  sort_order    integer default 0
);

create table public.appraisal_jobs (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid references public.items(id) on delete cascade,
  status     text default 'queued'
             check (status in ('queued','running','done','failed')),
  error      text,
  raw_output jsonb,
  created_at timestamptz default now()
);

create index on public.items (status);
create index on public.items (channel);
create index on public.items (category);
create index on public.items (lot_group);
create index on public.item_images (item_id);
create index on public.appraisal_jobs (status);

-- keep updated_at honest without the app having to remember
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.touch_updated_at();
