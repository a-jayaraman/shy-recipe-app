# Recipe App — Frontend

React 19 + TypeScript + Vite + Tailwind CSS v3 + shadcn/ui frontend for the Shy Blog recipe collection.

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` (the backend URL is already set for local dev):

```bash
cp .env.example .env
```

## Development

```bash
npm run dev        # dev server at http://localhost:5173
npm run build      # type-check + production build
npm run preview    # preview the production build locally
npm run lint       # ESLint
```

The backend must be running on port 8000. See the root [README](../README.md) for full setup instructions.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend base URL |

## Pages and Routes

| Path | Auth | Description |
|---|---|---|
| `/` | Public | Recipe list with search and filters |
| `/recipe/:id` | Public | Recipe detail with cooking mode overlay |
| `/recipe/new` | Editor+ | Create recipe form |
| `/recipe/:id/edit` | Editor+ | Edit recipe form |
| `/recommend` | Viewer+ | AI recommendation chat (SSE streaming) |
| `/admin/users` | Admin | User role and status management |
| `/login` | Public | Google OAuth sign-in |

## Project Structure

```
src/
├── api/            # Axios API client and typed request functions
├── auth/           # AuthProvider, useAuth hook, RequireAuth/RequireRole guards
├── components/
│   ├── ui/         # shadcn/ui primitives (Button, Dialog, Select, etc.)
│   ├── RecipeCard.tsx
│   ├── RecipeGrid.tsx
│   ├── RecipeForm.tsx
│   ├── CookingModeOverlay.tsx
│   ├── IngredientChipCombobox.tsx   # alias-aware ingredient search
│   ├── ChatMessage.tsx
│   ├── RecipeCardRow.tsx
│   ├── SuggestedPromptChip.tsx
│   └── UserMenu.tsx
├── hooks/
│   ├── useUrlFilters.ts             # all filter state lives in URL params
│   ├── useTagDisplayName.ts         # slug → human-readable display name
│   └── useRecommendStream.ts        # fetch-based SSE for AI chat
├── pages/
│   ├── RecipeListPage.tsx
│   ├── RecipeDetailPage.tsx
│   ├── RecipeFormPage.tsx
│   ├── RecommendPage.tsx
│   ├── LoginPage.tsx
│   ├── AdminUsersPage.tsx
│   └── AccessDeniedPage.tsx
├── types/          # Shared TypeScript interfaces
└── lib/            # Utilities (cn, etc.)
```

## Key Patterns

- **URL-driven filters** — all search/filter state on the list page is stored in `useSearchParams` via `useUrlFilters`, making searches shareable and browser-navigable.
- **Alias-aware ingredient search** — `IngredientChipCombobox` queries both canonical ingredient names and their aliases (e.g. typing "capsicum" matches "bell pepper" recipes).
- **SSE streaming** — the AI recommend page uses `fetch` + `response.body.getReader()` rather than `EventSource`, since the request is a POST with a JSON body.
- **Cooking mode** — `CookingModeOverlay` is a fullscreen fixed overlay; press Esc or the button to exit.
- **Back navigation** — filter state is passed via `navigate(path, { state: { from: location.search } })` so the detail page back button returns to the exact filtered list.
- **Toast notifications** — uses [Sonner](https://sonner.emilkowal.ski) (`toast()` from `'sonner'`), not shadcn's built-in toast.
- **Tailwind v3** — downgraded from v4 for shadcn/ui compatibility; `tailwindcss-animate` is required.
