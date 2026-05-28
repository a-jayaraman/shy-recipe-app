import { useQuery } from '@tanstack/react-query'
import { fetchAllTags, fetchTagAliases, fetchIngredientAliases } from '@/queries/tags'

export const TAGS_QUERY_KEY = ['tags'] as const
export const TAG_ALIASES_QUERY_KEY = ['aliases', 'tags'] as const
export const INGREDIENT_ALIASES_QUERY_KEY = ['aliases', 'ingredients'] as const

export function useAllTags() {
  return useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: fetchAllTags,
    staleTime: 5 * 60 * 1000,
  })
}

export function useTagAliases() {
  return useQuery({
    queryKey: TAG_ALIASES_QUERY_KEY,
    queryFn: fetchTagAliases,
    staleTime: Infinity,
  })
}

export function useIngredientAliases() {
  return useQuery({
    queryKey: INGREDIENT_ALIASES_QUERY_KEY,
    queryFn: fetchIngredientAliases,
    staleTime: Infinity,
  })
}

export function useTagDisplayName(slug: string): string {
  const { data: aliases } = useTagAliases()
  if (!slug) return ''
  if (aliases?.[slug]) return aliases[slug]
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
