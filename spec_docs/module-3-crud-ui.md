# Module 3 — Add / Edit / Delete Recipes

## Goal
Forms-based UI for creating new recipes, editing existing ones, and deleting them. Includes an LLM-assist feature: paste raw recipe text, get auto-filled structured fields and tags.

## Tech stack
- Same React + Vite + Tailwind + shadcn/ui stack as Module 2 (extends the same project)
- `react-hook-form` for form state
- `zod` for validation (shared schemas with backend ideal but not required)
- OpenRouter API for the LLM-assist feature, same flow as `tag_recipes.py`

## Inputs
- Module 1 API for write endpoints (`POST/PUT/PATCH/DELETE /recipes`)
- Module 2 codebase (extend, don't duplicate)
- `OPENROUTER_API_KEY` in `.env` for LLM-assist (frontend will call a small backend proxy endpoint, NOT expose the key to the browser)

## New routes
- `/recipe/new` — blank create form
- `/recipe/{id}/edit` — edit existing recipe
- Delete action lives on detail page + edit page as a button with confirmation dialog

## The form

Single page, divided into logical sections. All sections visible at once (no multi-step wizard — annoying for editing).

### Section 1 — Basics
- Title (text input)
- Author (text input, default to a fixed value pulled from env or hardcoded)
- Servings (text input — freeform like "4" or "6-8 small servings")
- Course (single-select dropdown from `GET /tags` enum list)
- Difficulty (segmented control: easy / medium / hard)
- Total time (segmented control: under-30-min / 30-60-min / 1-2-hrs / over-2-hrs / unknown)
- Prep time (text input, optional, freeform)
- Cook time (text input, optional, freeform)

### Section 2 — Ingredients
Dynamic list of ingredient rows. Each row has 4 fields side-by-side: amount / unit / name / notes. Plus a delete button per row.

- "Add ingredient" button at the bottom adds a blank row
- Drag handle to reorder (use `dnd-kit` — only if quick to integrate; otherwise up/down arrows on each row are acceptable)
- Unit field: autocomplete combobox from a fixed list (tsp, tbsp, cup, oz, lb, g, kg, ml, l, pinch, cloves, package — match the canonical set from standardization)
- Name field: autocomplete combobox from `GET /tags/key_ingredient` PLUS the union of all ingredient names from the `ingredients` table (so suggestions cover both filter tags and historical ingredient usage). Free-text allowed.

### Section 3 — Instructions
Dynamic list of steps. Each step is a textarea, numbered.
- "Add step" button at bottom
- Reordering (same approach as ingredients)
- Each step has a delete button

### Section 4 — Tags
Multi-value comboboxes for:
- Cuisine
- Cooking method
- Serve with
- Dietary
- Key ingredients

Each combobox:
- Fetches existing values from `GET /tags/{category}` as suggestions
- Allows free-text entry to create new values (with a "Create new: '...'" option in the dropdown)
- Selected values shown as removable chips
- Warn (small inline message) when adding a brand-new value that doesn't exist in the vocabulary yet — to encourage reuse

### Section 5 — Notes
A textarea for the `notes` field.

## LLM-assist feature

A button at the top of the new-recipe form: **"Paste recipe text and let Claude fill it in"**.

Flow:
1. Button opens a modal with a large textarea
2. User pastes recipe text (could be from a website, an email, a photo's OCR result, etc.)
3. User clicks "Parse"
4. Frontend calls `POST /api/v1/parse-recipe` on the backend with the text
5. Backend proxies to OpenRouter using the same system prompts as `tag_recipes.py` (the unstructured-variant prompt)
6. Backend returns the structured object
7. Frontend pre-fills the form fields with the parsed values
8. User reviews, edits as needed, clicks Save

This requires **adding a new endpoint to Module 1's backend**: `POST /api/v1/parse-recipe`, body `{"text": "..."}`. Response shape mirrors the LLM output schema. The OpenRouter key stays server-side.

If the parse fails (JSON error, API failure, etc.), surface a clear error and let the user fill manually.

## Validation rules

- Title required, min 2 chars
- At least 1 ingredient row with non-empty name
- At least 1 instruction step with non-empty text
- Course, difficulty, total_time required
- Cuisine: at least 1 value required
- Tag values: trimmed, lowercased on save (except cuisine values which keep their original casing — match backend conventions)

Show field-level errors inline, plus a summary banner at the top on submit attempts that fail validation.

## Save behavior

- "Save" button (primary)
  - New recipe: POST to `/recipes`, navigate to `/recipe/{new_id}` on success
  - Edit: PATCH `/recipes/{id}`, navigate back to `/recipe/{id}` on success
- "Cancel" button — confirms if there are unsaved changes, then navigates away
- Unsaved changes warning on navigation away (use `useBlocker` or beforeunload)

## Delete

- Delete button on the edit form and on the recipe detail page
- Always opens a confirmation dialog: "Delete '{title}'? This cannot be undone."
- On confirm: DELETE `/recipes/{id}`, navigate to `/`

## Acceptance criteria

- Create a new recipe end-to-end and see it appear in the list
- Edit an existing recipe, save, see changes persist
- Delete a recipe with confirmation
- LLM-assist: paste a paragraph of recipe text, get a reasonably populated form
- Add a brand-new key ingredient and see it show up in the filter sidebar after save
- Form validation catches all required fields
- Reordering ingredients/instructions persists in the saved order
- Unsaved-changes warning fires correctly

## Out of scope

- URL import (scrape a recipe from a website URL) — could be a future enhancement, not now
- Image uploads
- Recipe versioning / undo / history
- Bulk operations
- Import/export to other formats

---

## Amendment — Alias & Display Name System

### Ingredient name field — alias-aware autocomplete

The ingredient name combobox (Section 2 of the form) should behave exactly as described in the Module 2 amendment for the key ingredient filter: fetch `GET /aliases/ingredients` on load, cache it, match against both canonical names and aliases.

Specific behaviour when the user is adding an ingredient:

1. User types "hing"
2. Combobox shows: **asafoetida** `← recognized alias for "hing"` (with a small tag icon or muted label)
3. User selects it → the `name` field in that ingredient row is set to `"asafoetida"` (canonical)
4. If the user ignores the suggestion and types a free-form name, that's allowed — no hard constraint

The alias resolution hint should feel helpful, not nagging. Show it as a soft suggestion in the dropdown, not a warning banner.

Additionally: on save, the backend's `POST /parse-recipe` endpoint already resolves aliases server-side (see Module 1 amendment). So the LLM-assist flow auto-normalises ingredient names before the form is populated — the user sees canonical names by default without any extra UI work.

### Tag fields — display names

All tag multi-select comboboxes (cuisine, cooking method, serve with, dietary, key ingredients) should use `display_name` for what the user sees and the internal `value` (slug) for what gets sent to the API. Same pattern as Module 2: fetch `GET /aliases/tags` once, cache it, use a shared hook.

When creating a **new** tag value the user types that doesn't exist in the vocabulary:
- If it matches an alias in `GET /aliases/ingredients` (for key ingredients) or `GET /aliases/tags` (for tag fields), prompt: `Did you mean: [canonical]?` with an Accept button
- If it genuinely doesn't match anything known, show the "Create new: '...'" option with a subtle warning that it won't be recognised as an alias of anything existing

### Acceptance criteria additions

- Typing "hing" in an ingredient row name field suggests "asafoetida" with an alias note
- Selecting the suggestion sets the field to "asafoetida"
- Free-typing a name not in any alias list is still allowed without blocking the save
- All tag dropdowns show display names ("Deep Fry", not "deep-fry")
- LLM-assist results arrive with canonical ingredient names already resolved
