import { useState } from 'react'
import { Shuffle, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecipeCard } from './RecipeCard'
import { useRecipes } from '@/hooks/useRecipes'
import type { RecipeFilters } from '@/types/recipe'

interface RecipeGridProps {
  filters: RecipeFilters
  setFilters: (updates: Partial<RecipeFilters>) => void
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border overflow-hidden animate-pulse">
      <div className="h-36 bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="flex gap-1">
          <div className="h-5 bg-muted rounded w-16" />
          <div className="h-5 bg-muted rounded w-12" />
        </div>
      </div>
    </div>
  )
}

export function RecipeGrid({ filters, setFilters }: RecipeGridProps) {
  const [shuffleNonce, setShuffleNonce] = useState(0)
  const { data, isLoading, isError } = useRecipes(filters, 100, 0, shuffleNonce)

  const handleShuffle = () => {
    setFilters({ sort: 'random' })
    setShuffleNonce(n => n + 1)
  }

  const handleSort = (sort: string) => {
    setFilters({ sort })
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-muted-foreground">Failed to load recipes. Is the backend running?</p>
      </div>
    )
  }

  return (
    <div>
      {/* Controls bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {isLoading ? (
            <span className="inline-block h-4 w-32 bg-muted rounded animate-pulse" />
          ) : (
            <>Showing {data?.items.length ?? 0} of {data?.total ?? 0} recipes</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-border rounded-md">
            <ArrowUpDown size={12} className="ml-2 text-muted-foreground" />
            <select
              value={filters.sort}
              onChange={e => handleSort(e.target.value)}
              className="text-sm bg-transparent border-none outline-none py-1.5 pr-2 pl-1 text-foreground cursor-pointer"
            >
              <option value="title">A–Z</option>
              <option value="recent">Most Recent</option>
              <option value="random">Random</option>
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShuffle}
            className="gap-1.5 text-xs"
            title="Shuffle recipes"
          >
            <Shuffle size={13} />
            Shuffle
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data?.items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium text-foreground mb-2">No recipes match these filters</p>
          <p className="text-sm text-muted-foreground mb-4">Try adjusting or clearing your filters.</p>
          <Button variant="outline" onClick={() => setFilters({ cuisine: [], course: '', cooking_method: [], serve_with: [], dietary: [], key_ingredient: [], difficulty: '', total_time: '', q: '' })}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Recipe grid */}
      {!isLoading && data && data.items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.items.map(recipe => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  )
}
