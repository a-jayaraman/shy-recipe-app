import { supabase } from '@/lib/supabase'
import type { AllTagsResponse, TagValue } from '../types/recipe'

export async function fetchAllTags(): Promise<AllTagsResponse> {
  const [tagsRes, displayNamesRes] = await Promise.all([
    supabase.from('tags').select('id, category, value'),
    supabase.from('tag_display_names').select('slug, display_name'),
  ])

  if (tagsRes.error) throw new Error(tagsRes.error.message)
  if (displayNamesRes.error) throw new Error(displayNamesRes.error.message)

  const displayMap = new Map<string, string>(
    (displayNamesRes.data ?? []).map(r => [r.slug as string, r.display_name as string]),
  )

  const countMap = new Map<string, number>()
  // Fetch per-tag recipe counts via recipe_tags
  const { data: counts, error: countErr } = await supabase
    .from('recipe_tags')
    .select('tag_id')
  if (countErr) throw new Error(countErr.message)
  for (const row of counts ?? []) {
    const id = row.tag_id as number
    countMap.set(String(id), (countMap.get(String(id)) ?? 0) + 1)
  }

  const categories: AllTagsResponse['categories'] = {
    cuisine: [],
    cooking_method: [],
    serve_with: [],
    dietary: [],
    key_ingredient: [],
  }

  for (const tag of tagsRes.data ?? []) {
    const cat = tag.category as keyof typeof categories
    if (!(cat in categories)) continue
    const displayName = displayMap.get(tag.value as string)
      ?? (tag.value as string).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const tv: TagValue = {
      value: tag.value as string,
      display_name: displayName,
      count: countMap.get(String(tag.id)) ?? 0,
    }
    categories[cat].push(tv)
  }

  // Sort each category alphabetically by value
  for (const cat of Object.keys(categories) as Array<keyof typeof categories>) {
    categories[cat].sort((a, b) => a.value.localeCompare(b.value))
  }

  return { categories }
}

export async function fetchTagAliases(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('tag_display_names').select('slug, display_name')
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).map(r => [r.slug as string, r.display_name as string]))
}

export async function fetchIngredientAliases(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('aliases').select('alias, canonical')
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).map(r => [r.alias as string, r.canonical as string]))
}
