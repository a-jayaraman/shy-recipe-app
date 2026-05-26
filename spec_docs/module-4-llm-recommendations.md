# Module 4 — LLM Recommendation Interface

## Goal
A natural-language chat interface that recommends recipes from the user's collection based on what they ask for. The LLM has access to tools that wrap the Module 1 API; it parses intent, calls tools to fetch candidate recipes, and returns ranked recommendations with reasoning.

Example interactions:
- "I have tofu, broccoli, and soy sauce. Quick dinner ideas?"
- "Something Indian that goes with rice, no dairy"
- "I want to try something I haven't made before"
- "We've got friends coming over Saturday — what's a good Italian dinner I can make for 6?"
- "What can I do with the leftover paneer?"

## Tech stack
- React frontend (extends Module 2 codebase, adds a new page/route)
- Backend extension to Module 1: new endpoints + LLM orchestration
- OpenRouter API for the LLM, using `~anthropic/claude-haiku-latest`
- Streaming responses via SSE (Server-Sent Events)

## New route
- `/recommend` — chat interface. Link from the main nav alongside "Browse" and "Add recipe".

## UI

A chat interface, but tuned for recipe recommendations — NOT a generic chatbot.

**Top of page:**
- Title: "What should I cook?"
- Subtitle: "Ask in plain English. I'll search through your recipes."

**Suggested prompts** (clickable chips shown when chat is empty):
- "Quick weeknight dinner"
- "Something Indian with rice"
- "Vegan and gluten-free"
- "Use up the paneer in my fridge"
- "Something I haven't made in a while"

**Chat area:**
- User messages right-aligned, in a bubble
- Assistant messages left-aligned, full width
- When the assistant returns recipe recommendations, render them as a row of **clickable recipe cards** (same component as Module 2's `RecipeCard`), 2-4 cards per response, each linking to `/recipe/{id}`
- Above the cards, the assistant's reasoning text — short, conversational, explains why these picks ("Three quick options under 30 minutes that use tofu and broccoli...")

**Input area:**
- Textarea at the bottom (auto-resize), enter to submit, shift+enter for newline
- "Send" button
- "Clear conversation" link to reset

**Streaming:**
- Show a typing indicator while the LLM is thinking
- Stream the reasoning text token-by-token if SSE works cleanly; if not, show a spinner and render full response on completion
- Recipe cards appear AFTER the reasoning text is complete (don't try to stream those — render them as a block)

## Backend orchestration

### New endpoint: `POST /api/v1/recommend`

Request:
```json
{
  "messages": [
    {"role": "user", "content": "I have tofu and broccoli, quick dinner?"},
    {"role": "assistant", "content": "..."},
    {"role": "user", "content": "Something Indian"}
  ]
}
```

Response: SSE stream of events:
- `{"type": "text_delta", "delta": "..."}` — incremental LLM text
- `{"type": "tool_call", "name": "search_recipes", "args": {...}}` — visible in dev; collapsed in UI
- `{"type": "recipe_ids", "ids": [42, 17, 89]}` — final list of recipe ids being recommended (frontend fetches full cards via `GET /recipes` with `?id=...` or just calls `GET /recipes/{id}` for each)
- `{"type": "done"}` — end of stream

### Tools exposed to the LLM

Implement using OpenRouter's tool-calling. Tool schemas:

**`search_recipes`** — flexible filter, mirrors the Module 1 `GET /recipes` query params
```json
{
  "name": "search_recipes",
  "description": "Search the user's recipe collection by any combination of filters. Use this to find candidates matching the user's request. Returns up to 20 recipes with summary info. Call multiple times with different filters if needed to compare options or broaden a too-narrow search.",
  "input_schema": {
    "type": "object",
    "properties": {
      "cuisine":          {"type": "array", "items": {"type": "string"}, "description": "OR within field. Examples: Indian, South Indian, Italian"},
      "course":           {"type": "string", "enum": ["main", "side", "breakfast", "soup", "salad", "condiment", "dessert", "snack", "spice-mix", "drink"]},
      "cooking_method":   {"type": "array", "items": {"type": "string"}},
      "serve_with":       {"type": "array", "items": {"type": "string"}},
      "dietary":          {"type": "array", "items": {"type": "string"}},
      "key_ingredient":   {"type": "array", "items": {"type": "string"}, "description": "AND within field — recipe must contain ALL listed ingredients"},
      "has_ingredient":   {"type": "array", "items": {"type": "string"}, "description": "Looser ingredient match (matches partial names, e.g. 'tomato' matches 'cherry tomato')"},
      "difficulty":       {"type": "string", "enum": ["easy", "medium", "hard"]},
      "total_time":       {"type": "string", "enum": ["under-30-min", "30-60-min", "1-2-hrs", "over-2-hrs", "unknown"]},
      "q":                {"type": "string", "description": "Free text search across title and ingredient names"},
      "limit":            {"type": "integer", "default": 20}
    }
  }
}
```

**`get_recipe`** — fetch full detail of one recipe
```json
{
  "name": "get_recipe",
  "description": "Fetch the full details of a single recipe (all ingredients, all instructions, all tags). Use this when you need more than the summary returned by search_recipes to make a recommendation.",
  "input_schema": {
    "type": "object",
    "properties": {"id": {"type": "integer"}},
    "required": ["id"]
  }
}
```

**`list_available_filter_values`** — discover the vocabulary
```json
{
  "name": "list_available_filter_values",
  "description": "List the unique values available for a given filter category. Useful for figuring out what cuisines/ingredients/etc. exist in this collection before searching.",
  "input_schema": {
    "type": "object",
    "properties": {
      "category": {"type": "string", "enum": ["cuisine", "cooking_method", "serve_with", "dietary", "key_ingredient", "course"]}
    },
    "required": ["category"]
  }
}
```

### System prompt for the recommendation LLM

```
You are a helpful cooking assistant for a personal recipe collection. Your job is to recommend recipes from this collection — and ONLY from this collection — based on what the user is in the mood for or what they have on hand.

Tools available:
- search_recipes: filter and search the collection
- get_recipe: fetch full detail of a single recipe
- list_available_filter_values: discover what cuisines, ingredients, etc. exist

Approach:
1. Parse the user's intent (mood, ingredients available, time constraints, dietary needs, cuisine preference).
2. Call search_recipes with reasonable filters. If you get too few or zero results, broaden — drop the most restrictive filter and try again. If you get too many, narrow.
3. If you're unsure what filter values to use (e.g., user mentions an ingredient or cuisine you're not sure exists in the collection), call list_available_filter_values first.
4. Pick 2-4 recipes to recommend. Briefly explain WHY each is a good match in 1-2 sentences per recipe.
5. End your response with a JSON object: {"recipe_ids": [list of recommended ids]}

Tone: friendly, concise, like a knowledgeable friend. Never invent recipes that aren't in the collection. If nothing matches, say so honestly and suggest the closest alternatives or how the user could broaden their search.

The collection is mostly vegetarian Indian, Italian, Chinese, and Mexican recipes, ~150 total.
```

### Implementation notes

- Maintain conversation history server-side or pass full history each turn (pass full history is simpler, no DB).
- After the LLM returns its final response, extract the `recipe_ids` JSON block and emit it as a separate SSE event. The frontend uses this to render cards.
- If the LLM forgets to emit the JSON block, the frontend gracefully falls back to showing just the text reasoning.
- Tool calls in a loop with a hard cap of 6 tool-call rounds to prevent runaway loops.

## Project structure additions

```
backend/app/
  routers/
    recommend.py          # POST /api/v1/recommend with SSE
  llm/
    __init__.py
    tools.py              # tool definitions + dispatch to crud.py
    orchestrator.py       # tool-calling loop, OpenRouter client
    prompts.py            # system prompt

frontend/src/
  pages/
    RecommendPage.tsx
  components/
    ChatMessage.tsx
    RecipeCardRow.tsx
    SuggestedPromptChip.tsx
  hooks/
    useRecommendStream.ts   # SSE handling
```

## Acceptance criteria

- Ask "I have tofu and broccoli, quick dinner" — get reasonable recommendations from the collection (probably stir-fry, peanut noodle, etc.)
- Ask "Something Indian with rice" — get recipes tagged with `cuisine=Indian` and `serve_with=rice`
- Ask "What goes well with paneer" — model uses `has_ingredient=paneer`, returns paneer-containing dishes
- Asking for something the collection doesn't have ("Korean BBQ") gets an honest "I don't have anything Korean in this collection, but here are some recipes with similar flavors..." response — no hallucinated recipes
- Recipe cards in the response are clickable and navigate to the right detail pages
- Streaming text appears smoothly; if SSE breaks, full-response fallback works
- Tool-call loop terminates within reasonable time (no infinite loops)
- Multi-turn works: "Make it gluten-free" as a follow-up narrows the previous recommendations

## Out of scope

- Voice input
- Saving favorite recommendations
- Meal planning across multiple days
- Shopping list generation
- Nutritional analysis
- "Why did you recommend this" expandable explanation (the brief reasoning in the response is enough for now)

---

## Amendment — Alias & Display Name System

### Alias resolution in the tool dispatch layer

Before any `search_recipes` or `get_recipe` tool call is executed, resolve ingredient names in the tool arguments through the `ingredient_aliases` table. This happens in `llm/tools.py`, not in the LLM prompt.

Example: if the LLM calls `search_recipes({"has_ingredient": ["hing", "tamarind water"]})`, the dispatch layer resolves this to `["asafoetida", "tamarind"]` before querying the DB. The LLM never needs to know about the alias system; it just uses natural language and the backend normalises silently.

Similarly, `list_available_filter_values({"category": "key_ingredient"})` should return **both** canonical names and their aliases in the response, so the LLM knows what terms a user might use:

```json
{
  "category": "key_ingredient",
  "values": [
    {
      "canonical": "asafoetida",
      "aliases": ["hing", "hing (asafoetida)"],
      "count": 12
    },
    {
      "canonical": "bell pepper",
      "aliases": ["capsicum", "red capsicum", "red bell pepper", "green pepper"],
      "count": 8
    },
    ...
  ]
}
```

This is useful because a user might say "I have capsicum" and the model needs to know that searching for `bell pepper` is correct.

### System prompt update

Add one paragraph to the system prompt:

```
Ingredient vocabulary note: this collection uses canonical ingredient names.
Common aliases are automatically resolved by the search tools — for example,
searching for "hing" finds "asafoetida" recipes, "capsicum" finds "bell pepper"
recipes. You can use common names freely; the tools will handle normalisation.
When a user mentions an ingredient by an unfamiliar name, try searching for it
— it may be an alias the system recognises.
```

### Acceptance criteria additions

- User says "I have capsicum and tofu" → `search_recipes` is called with `bell pepper` and `tofu` (resolved)
- User says "something with hing" → tool call uses `asafoetida` in the query
- `list_available_filter_values(key_ingredient)` returns canonical + aliases, not just canonical names
- The system handles an alias the LLM uses without producing a "no results" response when results do exist under the canonical name
