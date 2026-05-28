-- ============================================================
-- Core tables (mirrors existing SQLite schema)
-- ============================================================

create table public.recipes (
  id                  bigserial primary key,
  blog_id             text,
  title               text not null,
  title_clean         text not null,
  title_inferred      boolean not null default false,
  author              text,
  published           date,
  updated             date,
  url_slug            text,
  servings            text,
  times_json          text,
  course              text check (course in ('main','side','breakfast','soup','salad','condiment','dessert','snack','spice-mix','drink')),
  difficulty          text check (difficulty in ('easy','medium','hard')),
  total_time          text check (total_time in ('under-30-min','30-60-min','1-2-hrs','over-2-hrs','unknown')),
  notes               text,
  content_raw         text,
  has_structured_data boolean not null default false,
  existing_tags_json  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by_user_id  uuid references auth.users(id),
  updated_by_user_id  uuid references auth.users(id)
);

create table public.ingredients (
  id         bigserial primary key,
  recipe_id  bigint not null references public.recipes(id) on delete cascade,
  order_idx  int not null,
  amount     text,
  unit       text,
  name       text not null,
  notes      text
);

create table public.instructions (
  id         bigserial primary key,
  recipe_id  bigint not null references public.recipes(id) on delete cascade,
  order_idx  int not null,
  text       text not null
);

create table public.tags (
  id       bigserial primary key,
  category text not null,
  value    text not null,
  unique (category, value)
);

create table public.recipe_tags (
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  tag_id    bigint not null references public.tags(id) on delete cascade,
  primary key (recipe_id, tag_id)
);

create table public.aliases (
  alias     text primary key,
  canonical text not null
);

create table public.tag_display_names (
  slug         text primary key,
  display_name text not null
);

-- profiles extends auth.users with app-level role
create table public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  email         text not null,
  role          text not null default 'viewer' check (role in ('viewer', 'editor', 'admin')),
  is_active     boolean not null default true,
  created_at    timestamptz default now(),
  last_login_at timestamptz
);

-- ============================================================
-- Indexes
-- ============================================================

create index on public.ingredients (recipe_id);
create index on public.instructions (recipe_id);
create index on public.recipe_tags (recipe_id);
create index on public.recipe_tags (tag_id);
create index on public.tags (category);
create index on public.recipes (course);
create index on public.recipes (difficulty);
create index on public.recipes (total_time);
create index on public.recipes (created_at desc);

-- ============================================================
-- Profile auto-creation trigger
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.raw_user_meta_data->>'email');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Role helper functions (used by RLS policies)
-- ============================================================

create or replace function public.is_editor()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('editor', 'admin')
      and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

-- ============================================================
-- Alias resolution helper
-- ============================================================

create or replace function public.resolve_ingredient_alias(p_name text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select canonical from public.aliases where alias = lower(p_name)),
    lower(p_name)
  );
$$;

-- ============================================================
-- search_recipes RPC
-- Used by both frontend (browse/filter) and Edge Function (AI tool execution)
-- Returns RecipeListItem-shaped rows + a total_count for pagination
-- ============================================================

create or replace function public.search_recipes(
  p_q              text    default null,
  p_cuisine        text[]  default null,
  p_course         text    default null,
  p_cooking_method text[]  default null,
  p_serve_with     text[]  default null,
  p_dietary        text[]  default null,
  p_key_ingredient text[]  default null,  -- AND semantics (recipe must have ALL)
  p_has_ingredient text[]  default null,  -- partial ingredient name match
  p_difficulty     text    default null,
  p_total_time     text    default null,
  p_sort           text    default 'recent',
  p_limit          int     default 100,
  p_offset         int     default 0
)
returns table (
  id            bigint,
  title_clean   text,
  course        text,
  difficulty    text,
  total_time    text,
  url_slug      text,
  cuisine       text[],
  cooking_method text[],
  serve_with    text[],
  dietary       text[],
  key_ingredients text[],
  total_count   bigint
)
language sql stable security definer set search_path = public
as $$
  with recipe_tag_agg as (
    select
      rt.recipe_id,
      array_agg(t.value) filter (where t.category = 'cuisine')         as cuisine,
      array_agg(t.value) filter (where t.category = 'cooking_method')  as cooking_method,
      array_agg(t.value) filter (where t.category = 'serve_with')      as serve_with,
      array_agg(t.value) filter (where t.category = 'dietary')         as dietary,
      array_agg(t.value) filter (where t.category = 'key_ingredient')  as key_ingredient
    from public.recipe_tags rt
    join public.tags t on t.id = rt.tag_id
    group by rt.recipe_id
  ),
  filtered as (
    select
      r.id,
      r.title_clean,
      r.course,
      r.difficulty,
      r.total_time,
      r.url_slug,
      coalesce(rta.cuisine,         '{}'::text[]) as cuisine,
      coalesce(rta.cooking_method,  '{}'::text[]) as cooking_method,
      coalesce(rta.serve_with,      '{}'::text[]) as serve_with,
      coalesce(rta.dietary,         '{}'::text[]) as dietary,
      coalesce(rta.key_ingredient,  '{}'::text[]) as key_ingredients,
      r.created_at
    from public.recipes r
    left join recipe_tag_agg rta on rta.recipe_id = r.id
    where
      -- free text search on title
      (p_q is null or r.title_clean ilike '%' || p_q || '%')

      -- cuisine: OR match (recipe has ANY of the requested values)
      and (p_cuisine is null or coalesce(rta.cuisine, '{}'::text[]) && p_cuisine)

      -- course: exact match
      and (p_course is null or r.course = p_course)

      -- cooking_method: OR match
      and (p_cooking_method is null or coalesce(rta.cooking_method, '{}'::text[]) && p_cooking_method)

      -- serve_with: OR match
      and (p_serve_with is null or coalesce(rta.serve_with, '{}'::text[]) && p_serve_with)

      -- dietary: OR match
      and (p_dietary is null or coalesce(rta.dietary, '{}'::text[]) && p_dietary)

      -- key_ingredient: AND match with alias resolution (all must be present)
      and (
        p_key_ingredient is null
        or (
          select array_agg(public.resolve_ingredient_alias(v))
          from unnest(p_key_ingredient) v
        ) <@ coalesce(rta.key_ingredient, '{}'::text[])
      )

      -- has_ingredient: partial name match on ingredient rows
      and (
        p_has_ingredient is null
        or exists (
          select 1
          from public.ingredients i,
               unnest(p_has_ingredient) hi
          where i.recipe_id = r.id
            and i.name ilike '%' || hi || '%'
        )
      )

      -- difficulty: exact match
      and (p_difficulty is null or r.difficulty = p_difficulty)

      -- total_time: exact match
      and (p_total_time is null or r.total_time = p_total_time)
  ),
  counted as (
    select count(*) as total_count from filtered
  )
  select
    f.id,
    f.title_clean,
    f.course,
    f.difficulty,
    f.total_time,
    f.url_slug,
    f.cuisine,
    f.cooking_method,
    f.serve_with,
    f.dietary,
    f.key_ingredients,
    c.total_count
  from filtered f, counted c
  order by
    case when p_sort = 'title'  then f.title_clean  end asc  nulls last,
    case when p_sort = 'random' then random()        end      nulls last,
    case when p_sort is null or p_sort not in ('title','random') then f.created_at end desc nulls last
  limit  p_limit
  offset p_offset;
$$;
