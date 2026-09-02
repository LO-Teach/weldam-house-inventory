-- Private bucket for web derivatives ONLY. Camera originals never come here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 5242880, array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- LOCAL-DEV ACCESS POLICIES
--
-- This app is localhost-only with no auth (see SPEC.md). It talks to Supabase
-- exclusively from server routes, so the key never reaches a browser. These
-- policies let the app run on the publishable/anon key when no service-role key
-- is configured.
--
-- To lock this down later: drop the four policies below. The app keeps working
-- as long as SUPABASE_SERVICE_ROLE_KEY is set in .env.local (service_role
-- bypasses RLS entirely).
-- ---------------------------------------------------------------------------
alter table public.items enable row level security;
alter table public.item_images enable row level security;
alter table public.appraisal_jobs enable row level security;

create policy "local dev full access" on public.items
  for all to anon, authenticated using (true) with check (true);

create policy "local dev full access" on public.item_images
  for all to anon, authenticated using (true) with check (true);

create policy "local dev full access" on public.appraisal_jobs
  for all to anon, authenticated using (true) with check (true);

create policy "local dev item-photos access" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'item-photos')
  with check (bucket_id = 'item-photos');
