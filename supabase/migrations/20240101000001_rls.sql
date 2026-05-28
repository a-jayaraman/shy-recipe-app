-- ============================================================
-- Row Level Security policies
-- ============================================================

-- Enable RLS on all tables
alter table public.recipes          enable row level security;
alter table public.ingredients      enable row level security;
alter table public.instructions     enable row level security;
alter table public.tags             enable row level security;
alter table public.recipe_tags      enable row level security;
alter table public.aliases          enable row level security;
alter table public.tag_display_names enable row level security;
alter table public.profiles         enable row level security;

-- ------------------------------------------------------------
-- recipes
-- ------------------------------------------------------------
create policy "recipes: public read"
  on public.recipes for select using (true);

create policy "recipes: editor insert"
  on public.recipes for insert with check (public.is_editor());

create policy "recipes: editor update"
  on public.recipes for update using (public.is_editor());

create policy "recipes: editor delete"
  on public.recipes for delete using (public.is_editor());

-- ------------------------------------------------------------
-- ingredients
-- ------------------------------------------------------------
create policy "ingredients: public read"
  on public.ingredients for select using (true);

create policy "ingredients: editor insert"
  on public.ingredients for insert with check (public.is_editor());

create policy "ingredients: editor update"
  on public.ingredients for update using (public.is_editor());

create policy "ingredients: editor delete"
  on public.ingredients for delete using (public.is_editor());

-- ------------------------------------------------------------
-- instructions
-- ------------------------------------------------------------
create policy "instructions: public read"
  on public.instructions for select using (true);

create policy "instructions: editor insert"
  on public.instructions for insert with check (public.is_editor());

create policy "instructions: editor update"
  on public.instructions for update using (public.is_editor());

create policy "instructions: editor delete"
  on public.instructions for delete using (public.is_editor());

-- ------------------------------------------------------------
-- tags
-- ------------------------------------------------------------
create policy "tags: public read"
  on public.tags for select using (true);

create policy "tags: editor insert"
  on public.tags for insert with check (public.is_editor());

create policy "tags: editor update"
  on public.tags for update using (public.is_editor());

create policy "tags: editor delete"
  on public.tags for delete using (public.is_editor());

-- ------------------------------------------------------------
-- recipe_tags
-- ------------------------------------------------------------
create policy "recipe_tags: public read"
  on public.recipe_tags for select using (true);

create policy "recipe_tags: editor insert"
  on public.recipe_tags for insert with check (public.is_editor());

create policy "recipe_tags: editor delete"
  on public.recipe_tags for delete using (public.is_editor());

-- ------------------------------------------------------------
-- aliases (read-only for clients; seeded via migration script)
-- ------------------------------------------------------------
create policy "aliases: public read"
  on public.aliases for select using (true);

create policy "aliases: editor write"
  on public.aliases for insert with check (public.is_editor());

create policy "aliases: editor update"
  on public.aliases for update using (public.is_editor());

-- ------------------------------------------------------------
-- tag_display_names (read-only for clients)
-- ------------------------------------------------------------
create policy "tag_display_names: public read"
  on public.tag_display_names for select using (true);

-- ------------------------------------------------------------
-- profiles
-- Users can read their own row; admins can read all rows.
-- Only admins can update (role/active management).
-- INSERT is handled by the trigger (no client INSERT).
-- ------------------------------------------------------------
create policy "profiles: own read"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles: admin update"
  on public.profiles for update
  using (public.is_admin());
