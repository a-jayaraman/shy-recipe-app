import { supabase } from '@/lib/supabase'
import type {
  RecipeListResponse,
  RecipeDetail,
  RecipeFilters,
  RecipeWritePayload,
  RecipeWriteResponse,
  ParseRecipeResponse,
  Ingredient,
} from '../types/recipe'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ---------------------------------------------------------------------------
// List / search
// ---------------------------------------------------------------------------

export async function fetchRecipes(
  filters: Partial<RecipeFilters> & { limit?: number; offset?: number },
): Promise<RecipeListResponse> {
  const params: Record<string, unknown> = {
    p_limit: filters.limit ?? 100,
    p_offset: filters.offset ?? 0,
    p_sort: filters.sort ?? 'recent',
  }

  if (filters.q)               params.p_q = filters.q
  if (filters.course)          params.p_course = filters.course
  if (filters.difficulty)      params.p_difficulty = filters.difficulty
  if (filters.total_time)      params.p_total_time = filters.total_time
  if (filters.cuisine?.length)         params.p_cuisine = filters.cuisine
  if (filters.cooking_method?.length)  params.p_cooking_method = filters.cooking_method
  if (filters.serve_with?.length)      params.p_serve_with = filters.serve_with
  if (filters.dietary?.length)         params.p_dietary = filters.dietary
  if (filters.key_ingredient?.length)  params.p_key_ingredient = filters.key_ingredient

  const { data, error } = await supabase.rpc('search_recipes', params)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0

  return {
    total,
    limit: filters.limit ?? 100,
    offset: filters.offset ?? 0,
    items: rows.map(r => ({
      id: Number(r.id),
      title_clean: r.title_clean as string,
      course: r.course as string | null,
      difficulty: r.difficulty as string | null,
      total_time: r.total_time as string | null,
      url_slug: r.url_slug as string | null,
      cuisine: (r.cuisine as string[]) ?? [],
      cooking_method: (r.cooking_method as string[]) ?? [],
      serve_with: (r.serve_with as string[]) ?? [],
      dietary: (r.dietary as string[]) ?? [],
      key_ingredients: (r.key_ingredients as string[]) ?? [],
    })),
  }
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function fetchRecipeById(id: number): Promise<RecipeDetail> {
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      ingredients ( id, order_idx, amount, unit, name, notes ),
      instructions ( id, order_idx, text ),
      recipe_tags ( tags ( category, value ) )
    `)
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error(`Recipe ${id} not found`)

  const tagsRaw = (data.recipe_tags ?? []) as Array<{ tags: { category: string; value: string } | null }>
  const tagsByCategory: Record<string, string[]> = {}
  for (const rt of tagsRaw) {
    if (!rt.tags) continue
    const { category, value } = rt.tags
    if (!tagsByCategory[category]) tagsByCategory[category] = []
    tagsByCategory[category].push(value)
  }

  const times: Record<string, string> = {}
  try {
    const parsed = JSON.parse(data.times_json ?? '{}')
    if (typeof parsed === 'object' && parsed !== null) Object.assign(times, parsed)
  } catch { /* ignore malformed */ }

  const ingredients: Ingredient[] = ((data.ingredients ?? []) as Array<Record<string, unknown>>)
    .sort((a, b) => (a.order_idx as number) - (b.order_idx as number))
    .map(i => ({
      order_idx: i.order_idx as number,
      amount: (i.amount ?? null) as string | null,
      unit: (i.unit ?? null) as string | null,
      name: i.name as string,
      notes: (i.notes ?? null) as string | null,
    }))

  const instructions: string[] = ((data.instructions ?? []) as Array<Record<string, unknown>>)
    .sort((a, b) => (a.order_idx as number) - (b.order_idx as number))
    .map(i => i.text as string)

  const existingTags: string[] = []
  try {
    const parsed = JSON.parse(data.existing_tags_json ?? '[]')
    if (Array.isArray(parsed)) existingTags.push(...parsed)
  } catch { /* ignore */ }

  return {
    id: data.id as number,
    blog_id: data.blog_id as string | null,
    title: data.title as string,
    title_clean: data.title_clean as string,
    title_inferred: data.title_inferred as boolean,
    author: data.author as string | null,
    published: data.published as string | null,
    updated: data.updated as string | null,
    url_slug: data.url_slug as string | null,
    servings: data.servings as string | null,
    times,
    course: data.course as string | null,
    difficulty: data.difficulty as string | null,
    total_time: data.total_time as string | null,
    notes: data.notes as string | null,
    has_structured_data: data.has_structured_data as boolean,
    existing_tags: existingTags,
    ingredients,
    instructions,
    cuisine: tagsByCategory['cuisine'] ?? [],
    cooking_method: tagsByCategory['cooking_method'] ?? [],
    serve_with: tagsByCategory['serve_with'] ?? [],
    dietary: tagsByCategory['dietary'] ?? [],
    key_ingredients: tagsByCategory['key_ingredient'] ?? [],
  }
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

async function upsertTags(
  tagArrays: {
    cuisine: string[]
    cooking_method: string[]
    serve_with: string[]
    dietary: string[]
    key_ingredients: string[]
  },
): Promise<Map<string, number>> {
  const entries: Array<{ category: string; value: string }> = [
    ...tagArrays.cuisine.map(v => ({ category: 'cuisine', value: v })),
    ...tagArrays.cooking_method.map(v => ({ category: 'cooking_method', value: v })),
    ...tagArrays.serve_with.map(v => ({ category: 'serve_with', value: v })),
    ...tagArrays.dietary.map(v => ({ category: 'dietary', value: v })),
    ...tagArrays.key_ingredients.map(v => ({ category: 'key_ingredient', value: v })),
  ]

  if (entries.length === 0) return new Map()

  const { data, error } = await supabase
    .from('tags')
    .upsert(entries, { onConflict: 'category,value', ignoreDuplicates: false })
    .select('id, category, value')

  if (error) throw new Error(error.message)

  const map = new Map<string, number>()
  for (const t of data ?? []) {
    map.set(`${t.category}:${t.value}`, t.id as number)
  }
  return map
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createRecipe(payload: RecipeWritePayload): Promise<RecipeWriteResponse> {
  const warnings: string[] = []

  const { data: recipeRow, error: recipeErr } = await supabase
    .from('recipes')
    .insert({
      title: payload.title,
      title_clean: payload.title_clean,
      author: payload.author ?? null,
      servings: payload.servings ?? null,
      times_json: JSON.stringify(payload.times ?? {}),
      course: payload.course ?? null,
      difficulty: payload.difficulty ?? null,
      total_time: payload.total_time ?? null,
      notes: payload.notes ?? null,
    })
    .select('id')
    .single()

  if (recipeErr) throw new Error(recipeErr.message)
  const id = recipeRow.id as number

  // ingredients
  if (payload.ingredients.length > 0) {
    const { error } = await supabase.from('ingredients').insert(
      payload.ingredients.map((ing, idx) => ({
        recipe_id: id,
        order_idx: idx,
        amount: ing.amount ?? null,
        unit: ing.unit ?? null,
        name: ing.name,
        notes: ing.notes ?? null,
      })),
    )
    if (error) warnings.push(`Ingredients: ${error.message}`)
  }

  // instructions
  if (payload.instructions.length > 0) {
    const { error } = await supabase.from('instructions').insert(
      payload.instructions.map((text, idx) => ({ recipe_id: id, order_idx: idx, text })),
    )
    if (error) warnings.push(`Instructions: ${error.message}`)
  }

  // tags
  const tagIds = await upsertTags(payload)
  if (tagIds.size > 0) {
    const { error } = await supabase.from('recipe_tags').insert(
      Array.from(tagIds.values()).map(tag_id => ({ recipe_id: id, tag_id })),
    )
    if (error) warnings.push(`Tags: ${error.message}`)
  }

  const detail = await fetchRecipeById(id)
  return { ...detail, warnings }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateRecipe(id: number, payload: RecipeWritePayload): Promise<RecipeWriteResponse> {
  const warnings: string[] = []

  const { error: recipeErr } = await supabase
    .from('recipes')
    .update({
      title: payload.title,
      title_clean: payload.title_clean,
      author: payload.author ?? null,
      servings: payload.servings ?? null,
      times_json: JSON.stringify(payload.times ?? {}),
      course: payload.course ?? null,
      difficulty: payload.difficulty ?? null,
      total_time: payload.total_time ?? null,
      notes: payload.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (recipeErr) throw new Error(recipeErr.message)

  // Replace ingredients
  await supabase.from('ingredients').delete().eq('recipe_id', id)
  if (payload.ingredients.length > 0) {
    const { error } = await supabase.from('ingredients').insert(
      payload.ingredients.map((ing, idx) => ({
        recipe_id: id,
        order_idx: idx,
        amount: ing.amount ?? null,
        unit: ing.unit ?? null,
        name: ing.name,
        notes: ing.notes ?? null,
      })),
    )
    if (error) warnings.push(`Ingredients: ${error.message}`)
  }

  // Replace instructions
  await supabase.from('instructions').delete().eq('recipe_id', id)
  if (payload.instructions.length > 0) {
    const { error } = await supabase.from('instructions').insert(
      payload.instructions.map((text, idx) => ({ recipe_id: id, order_idx: idx, text })),
    )
    if (error) warnings.push(`Instructions: ${error.message}`)
  }

  // Replace tags
  await supabase.from('recipe_tags').delete().eq('recipe_id', id)
  const tagIds = await upsertTags(payload)
  if (tagIds.size > 0) {
    const { error } = await supabase.from('recipe_tags').insert(
      Array.from(tagIds.values()).map(tag_id => ({ recipe_id: id, tag_id })),
    )
    if (error) warnings.push(`Tags: ${error.message}`)
  }

  const detail = await fetchRecipeById(id)
  return { ...detail, warnings }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteRecipe(id: number): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Parse recipe via Edge Function
// ---------------------------------------------------------------------------

export async function parseRecipeText(text: string): Promise<ParseRecipeResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-recipe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(msg)
  }
  return res.json()
}
