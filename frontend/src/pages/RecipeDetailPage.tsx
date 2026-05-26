import { useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { ArrowLeft, ChefHat, Clock, Users, Calendar, Utensils, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/useAuth'
import { hasRole } from '@/types/auth'
import { TagBadge } from '@/components/TagBadge'
import { RecipeCard } from '@/components/RecipeCard'
import { CookingModeOverlay } from '@/components/CookingModeOverlay'
import { useRecipeDetail, useRecipes } from '@/hooks/useRecipes'
import { TOTAL_TIME_LABELS, DIFFICULTY_LABELS, cn } from '@/lib/utils'
import type { RecipeFilters } from '@/types/recipe'

const EMPTY_FILTERS: RecipeFilters = {
  q: '', cuisine: [], course: '', cooking_method: [], serve_with: [],
  dietary: [], key_ingredient: [], difficulty: '', total_time: '', sort: 'title',
}

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backSearch = (location.state as { from?: string } | null)?.from ?? ''
  const { user } = useAuth()
  const canEdit = user ? hasRole(user, 'editor') : false

  const recipeId = id ? Number(id) : undefined
  const { data: recipe, isLoading, isError } = useRecipeDetail(recipeId)

  const [cookingMode, setCookingMode] = useState(false)
  const [struckIngredients, setStruckIngredients] = useState<Set<number>>(new Set())
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set())

  const moreLikeFilters: RecipeFilters = recipe ? {
    ...EMPTY_FILTERS,
    cuisine: recipe.cuisine.slice(0, 1),
    course: recipe.course ?? '',
    sort: 'title',
  } : EMPTY_FILTERS

  const { data: moreLikeData } = useRecipes(
    moreLikeFilters,
    8,
    0,
    0,
  )

  const moreLike = moreLikeData?.items.filter(r => r.id !== recipeId).slice(0, 4) ?? []

  const toggleIngredient = (idx: number) => {
    setStruckIngredients(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-8 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-1/3" />
        </div>
      </div>
    )
  }

  if (isError || !recipe) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground mb-4">Recipe not found.</p>
          <Link to={`/${backSearch}`} className="text-primary hover:underline">← Back to recipes</Link>
        </div>
      </div>
    )
  }

  const timeEntries = Object.entries(recipe.times ?? {})

  return (
    <>
      {cookingMode && (
        <CookingModeOverlay
          instructions={recipe.instructions}
          onClose={() => setCookingMode(false)}
        />
      )}

      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <Link
            to={`/${backSearch}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft size={14} />
            Back to recipes
          </Link>

          {/* Header */}
          <div className="mb-6">
            <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight mb-4">
              {recipe.title_clean}
            </h1>

            {/* Tag badges grouped by category */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {recipe.cuisine.map(t => <TagBadge key={t} slug={t} category="cuisine" />)}
              {recipe.course && <TagBadge slug={recipe.course} category="course" />}
              {recipe.cooking_method.map(t => <TagBadge key={t} slug={t} category="cooking_method" />)}
              {recipe.dietary.map(t => <TagBadge key={t} slug={t} category="dietary" />)}
              {recipe.serve_with.map(t => <TagBadge key={t} slug={t} category="serve_with" />)}
            </div>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {recipe.author && (
                <span className="flex items-center gap-1.5">
                  <ChefHat size={14} />
                  {recipe.author}
                </span>
              )}
              {recipe.published && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {new Date(recipe.published).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              )}
              {recipe.servings && (
                <span className="flex items-center gap-1.5">
                  <Users size={14} />
                  {recipe.servings} servings
                </span>
              )}
              {recipe.difficulty && (
                <span className="flex items-center gap-1.5">
                  <Utensils size={14} />
                  {DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty}
                </span>
              )}
              {recipe.total_time && recipe.total_time !== 'unknown' && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {TOTAL_TIME_LABELS[recipe.total_time] ?? recipe.total_time}
                </span>
              )}
              {timeEntries.map(([key, val]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {key}: {val}
                </span>
              ))}
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Ingredients */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif text-xl font-semibold flex items-center gap-2">
                  <Utensils size={18} />
                  Ingredients
                </h2>
                {recipe.servings && (
                  <span className="text-sm text-muted-foreground border border-border rounded px-2 py-0.5">
                    {recipe.servings} servings
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">Click to cross off as you go</p>
              <ol className="space-y-2">
                {recipe.ingredients.map((ing) => (
                  <li
                    key={ing.order_idx}
                    onClick={() => toggleIngredient(ing.order_idx)}
                    className={cn(
                      'flex gap-2 cursor-pointer rounded p-2 -mx-2 hover:bg-muted/50 transition-colors text-sm',
                      struckIngredients.has(ing.order_idx) && 'opacity-40'
                    )}
                  >
                    <span className={cn(
                      'text-foreground leading-relaxed',
                      struckIngredients.has(ing.order_idx) && 'line-through'
                    )}>
                      {[ing.amount, ing.unit, ing.name].filter(Boolean).join(' ')}
                      {ing.notes && (
                        <span className="text-muted-foreground ml-1 text-xs">({ing.notes})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Right: Instructions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif text-xl font-semibold flex items-center gap-2">
                  <BookOpen size={18} />
                  Instructions
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCookingMode(true)}
                  className="gap-1.5 text-xs border-primary text-primary hover:bg-primary hover:text-white"
                >
                  <ChefHat size={13} />
                  Cooking Mode
                </Button>
              </div>
              <ol className="space-y-4">
                {recipe.instructions.map((step, stepIdx) => (
                  <li
                    key={stepIdx}
                    onClick={() => {
                      setDoneSteps(prev => {
                        const next = new Set(prev)
                        if (next.has(stepIdx)) next.delete(stepIdx)
                        else next.add(stepIdx)
                        return next
                      })
                    }}
                    className={cn(
                      'flex gap-3 cursor-pointer rounded p-2 -mx-2 hover:bg-muted/30 transition-colors',
                      doneSteps.has(stepIdx) && 'opacity-40'
                    )}
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
                      {stepIdx + 1}
                    </span>
                    <p className={cn(
                      'text-sm leading-relaxed text-foreground',
                      doneSteps.has(stepIdx) && 'line-through text-muted-foreground'
                    )}>
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Notes */}
          {recipe.notes && (
            <div className="mt-8 p-4 bg-muted/40 rounded-lg border border-border">
              <h3 className="font-medium text-sm mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{recipe.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-border flex items-center justify-between flex-wrap gap-4">
            {canEdit && (
              <Button variant="outline" asChild>
                <Link to={`/recipe/${recipeId}/edit`}>Edit this recipe</Link>
              </Button>
            )}
            {recipe.url_slug && (
              <a
                href={`https://shyblogs.com/${recipe.url_slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                View original post →
              </a>
            )}
          </div>

          {/* More like this */}
          {moreLike.length > 0 && (
            <div className="mt-10">
              <h2 className="font-serif text-xl font-semibold mb-4">More like this</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {moreLike.map(r => (
                  <RecipeCard key={r.id} recipe={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
