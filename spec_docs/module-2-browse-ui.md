# Module 2 — Browse / Filter / Search Frontend

## Goal
A React frontend that lets a user browse, filter, search, and view recipes. Read-only. Talks to the Module 1 API. This is the highest-value user-facing piece — once it's working, the app is genuinely useful even without modules 3 and 4.

## Tech stack (non-negotiable)
- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui for components (button, input, select, checkbox, badge, card, dialog, sheet)
- TanStack Query (React Query) for API calls + caching
- React Router for navigation
- `lucide-react` for icons

## Inputs
- Module 1 API running on `http://localhost:8000` (configurable via `VITE_API_BASE_URL`)
- API contract: see `module-1-backend.md`. Specifically `GET /recipes`, `GET /recipes/{id}`, `GET /tags`.

## Pages

### `/` — Recipe list (the main screen)

Layout: filter sidebar on the left (collapsible on mobile via a Sheet), recipe grid on the right.

**Filter sidebar:**
- Search box (debounced 300ms, hits `q` param)
- Cuisine — multi-select checkbox list, OR semantics, fetched from `GET /tags/cuisine`
- Course — single-select segmented control (since there's a small fixed set)
- Cooking method — multi-select checkbox list
- Difficulty — segmented control (easy / medium / hard / any)
- Total time — segmented control (under-30-min / 30-60-min / 1-2-hrs / over-2-hrs / any)
- Serve with — multi-select chips
- Dietary — multi-select chips
- **Key ingredients** — combobox with autocomplete (typeahead from `GET /tags/key_ingredient`), allows multiple selections shown as removable chips. AND semantics ("I have all these"). Show count of recipes matching as user adds ingredients.
- "Clear all filters" link at top of sidebar, only shown when any filter is active

Each filter section should be collapsible and show "(3)" next to the heading when 3 values are selected.

URL state: all active filters should be encoded as query string params so the URL is shareable and back-button works. Use `useSearchParams` from react-router.

**Recipe grid:**
- Responsive: 1 column mobile, 2 columns tablet, 3-4 columns desktop
- Each card shows: title (title_clean), cuisine badges, course badge, difficulty badge, total_time badge, first 3 key ingredients as muted text, and a placeholder thumbnail area (no images for now — leave a colored gradient block keyed off recipe id so they're visually distinct)
- Click card → navigate to `/recipe/{id}`
- Top of grid: result count ("Showing 42 of 147 recipes"), sort dropdown (alphabetical / most recent / random), and a "shuffle" button that re-randomizes
- Empty state: "No recipes match these filters" with a "clear filters" button

### `/recipe/{id}` — Recipe detail

Layout: two-column on desktop, single-column on mobile.

**Header:**
- Title (large)
- Breadcrumb: `← Back to recipes` (preserves filter state via `useSearchParams` history)
- All tag badges grouped by category
- Metadata row: author, published date, servings, prep/cook times

**Left column (or top on mobile) — Ingredients:**
- Header "Ingredients" with servings selector (just display, no scaling logic — that's a future enhancement)
- Ordered list. Each ingredient rendered as `[amount] [unit] [name]` with notes in muted text if present. Strikethrough on click (local state only, not persisted) — purely a visual "I have this / done with this" toggle while cooking.

**Right column (or bottom on mobile) — Instructions:**
- Numbered list
- "Cooking mode" toggle button at the top
- When cooking mode is ON: full-screen overlay, current step is large, prev/next buttons, dim other steps. Esc to exit.
- Optional but nice: step click to "mark done" with a checkmark

**Footer of detail page:**
- "Edit this recipe" button → navigates to `/recipe/{id}/edit` (route exists, deferred to module 3 — show "Coming soon" toast for now)
- "More like this" — call `GET /recipes?cuisine=<first cuisine>&course=<course>&limit=4` excluding current id, show 3-4 mini-cards

## Design system

Tailwind config with a clean, food-focused palette. Lean warm and inviting, NOT generic SaaS-blue.

Suggested tokens (pick one and stick with it):
- Primary: warm terracotta or muted saffron
- Background: cream / off-white
- Card: white with soft shadow
- Text: warm dark gray, not pure black
- Accent for tags: distinct soft hues per category (cuisine = different hue per cuisine; course = muted green; method = muted blue; dietary = muted pink)

Typography: a serif for recipe titles (Lora, Fraunces, or Source Serif Pro), sans-serif everywhere else.

## State management

- Server state: TanStack Query (cache `GET /tags` indefinitely; refetch recipes on filter change)
- UI state: useState / useSearchParams
- No global state library needed for this scope (no Redux, no Zustand)

## Performance

- Debounce the search box (300ms)
- Use `staleTime: 5 * 60 * 1000` for `GET /tags` (rarely changes)
- Virtualize the recipe grid IF count grows past 500, otherwise unnecessary

## Project structure

```
frontend/
  src/
    main.tsx
    App.tsx                    # router + query client setup
    api/
      client.ts                # axios or fetch wrapper, base URL from env
      recipes.ts               # typed API methods
      tags.ts
    types/
      recipe.ts                # mirrors backend response shapes
    components/
      ui/                      # shadcn components live here
      RecipeCard.tsx
      RecipeGrid.tsx
      FilterSidebar.tsx
      FilterSection.tsx
      IngredientChipCombobox.tsx
      TagBadge.tsx
      CookingModeOverlay.tsx
    pages/
      RecipeListPage.tsx
      RecipeDetailPage.tsx
    hooks/
      useRecipes.ts            # wraps useQuery
      useTags.ts
      useUrlFilters.ts         # syncs filters ↔ URL
    lib/
      utils.ts
  index.html
  package.json
  tailwind.config.js
  vite.config.ts
  .env.example                 # VITE_API_BASE_URL=http://localhost:8000/api/v1
  README.md
```

## Acceptance criteria

- `npm install && npm run dev` runs and connects to running backend
- Filter sidebar populates from `GET /tags` automatically
- Adding filters updates the recipe grid AND the URL
- Loading the URL `localhost:5173/?cuisine=Indian&key_ingredient=paneer` directly shows the right recipes pre-filtered
- Recipe detail page renders all ingredients and instructions cleanly
- Cooking mode is usable (large readable text, prev/next works)
- Looks good on mobile (test at 375px width)
- No console errors

## Out of scope

- Editing recipes (module 3)
- Image uploads / display (no images in current data)
- Servings scaling math
- Print-friendly view
- Account/auth
- LLM features (module 4)

---

## Amendment — Alias & Display Name System

### Tag display names throughout the UI

The backend now returns `display_name` alongside every tag value (from `GET /tags/{category}`). Use `display_name` everywhere a tag is rendered to a human — filter sidebar labels, recipe card badges, detail page tag chips. Store and pass around the internal `value` (slug) for API calls; only render `display_name` to the user.

Examples:
- Badge on a recipe card reads **"Instant Pot"** not `instant-pot`
- Filter checkbox label reads **"Gluten-Free"** not `gluten-free`
- Dietary chip reads **"Contains Dairy"** not `contains-dairy`

Fetch `GET /aliases/tags` once on app load (alongside `GET /tags`) and cache it with `staleTime: Infinity`. Use it as a lookup in a shared `useTagDisplayName(slug)` hook so every component uses the same source.

### Key ingredient combobox — alias-aware typeahead

Fetch `GET /aliases/ingredients` on app load and cache it (`staleTime: Infinity`). The full ~764-entry map lives in memory; it's ~50KB, well within budget.

When the user types in the key ingredient combobox:

1. Match against both canonical names (from `GET /tags/key_ingredient`) AND all known aliases (from `GET /aliases/ingredients`)
2. When an alias matches, show a suggestion entry that says: `"asafoetida"  ← also known as "hing"` (alias shown in muted text)
3. Selecting it inserts the **canonical name** into the filter, not the alias the user typed
4. Show a subtle inline note: `Searching for: asafoetida` when a resolution happened

This means a user typing "capsicum" sees "bell pepper ← also known as capsicum" and the filter correctly queries `key_ingredient=bell+pepper`.

### Acceptance criteria additions

- All tag badges and filter labels display human-readable names ("Instant Pot", not "instant-pot")
- Typing "hing" in the ingredient combobox surfaces "asafoetida ← also known as hing"
- Selecting that suggestion filters by `key_ingredient=asafoetida`
- Typing "capsicum" surfaces "bell pepper ← also known as capsicum"
