import { useSearchParams } from 'react-router-dom'
import { useCallback } from 'react'
import type { RecipeFilters } from '../types/recipe'

export function useUrlFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: RecipeFilters = {
    q: searchParams.get('q') ?? '',
    cuisine: searchParams.getAll('cuisine'),
    course: searchParams.get('course') ?? '',
    cooking_method: searchParams.getAll('cooking_method'),
    serve_with: searchParams.getAll('serve_with'),
    dietary: searchParams.getAll('dietary'),
    key_ingredient: searchParams.getAll('key_ingredient'),
    difficulty: searchParams.get('difficulty') ?? '',
    total_time: searchParams.get('total_time') ?? '',
    sort: searchParams.get('sort') ?? 'title',
  }

  const setFilters = useCallback((updates: Partial<RecipeFilters>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [key, val] of Object.entries(updates)) {
        if (Array.isArray(val)) {
          next.delete(key)
          val.forEach(v => next.append(key, v))
        } else if (val) {
          next.set(key, val as string)
        } else {
          next.delete(key)
        }
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const hasActiveFilters =
    filters.q !== '' ||
    filters.cuisine.length > 0 ||
    filters.course !== '' ||
    filters.cooking_method.length > 0 ||
    filters.serve_with.length > 0 ||
    filters.dietary.length > 0 ||
    filters.key_ingredient.length > 0 ||
    filters.difficulty !== '' ||
    filters.total_time !== ''

  return { filters, setFilters, clearFilters, hasActiveFilters }
}
