-- user_drafts: stores generated assets saved by users from AI replies
create table if not exists public.user_drafts (
  id            uuid primary key default gen_random_uuid(),
  org_id        text        not null,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  filename      text        not null,
  storage_path  text        not null,  -- <org_id>/<user_id>/drafts/<filename>
  source_path   text,                  -- original temp path, for reference
  media_type    text        not null default 'image', -- 'image' | 'video'
  created_at    timestamptz not null default now()
);

-- RLS
alter table public.user_drafts enable row level security;

create policy "Users can read their own drafts"
  on public.user_drafts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own drafts"
  on public.user_drafts for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own drafts"
  on public.user_drafts for delete
  using (auth.uid() = user_id);
