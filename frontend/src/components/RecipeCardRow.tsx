import { useQueries } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { fetchRecipeById } from '@/queries/recipes'
import { RecipeCard } from './RecipeCard'

interface RecipeCardRowProps {
  recipeIds: number[]
}

export function RecipeCardRow({ recipeIds }: RecipeCardRowProps) {
  const queries = useQueries({
    queries: recipeIds.map(id => ({
      queryKey: ['recipe', id] as const,
      queryFn: () => fetchRecipeById(id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const isLoading = queries.some(q => q.isLoading)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        Loading recipes…
      </div>
    )
  }

  const recipes = queries.filter(q => q.data != null).map(q => q.data!)

  if (recipes.length === 0) return null

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 mt-3">
      {recipes.map(recipe => (
        <div key={recipe.id} className="w-52 shrink-0">
          <RecipeCard recipe={recipe} />
        </div>
      ))}
    </div>
  )
}
