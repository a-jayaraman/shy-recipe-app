import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { TagBadge } from './TagBadge'
import { recipeGradient, TOTAL_TIME_LABELS, DIFFICULTY_LABELS, COURSE_LABELS } from '@/lib/utils'
import { Clock, ChefHat } from 'lucide-react'
import type { RecipeListItem } from '@/types/recipe'

interface RecipeCardProps {
  recipe: RecipeListItem
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow duration-200 overflow-hidden group"
      onClick={() => navigate(`/recipe/${recipe.id}`, { state: { from: location.search } })}
    >
      <div
        className="h-36 w-full"
        style={{ background: recipeGradient(recipe.id) }}
        aria-hidden
      />
      <CardContent className="p-4 space-y-2">
        <h3 className="font-serif text-base font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {recipe.title_clean}
        </h3>

        <div className="flex flex-wrap gap-1">
          {recipe.cuisine.slice(0, 2).map(c => (
            <TagBadge key={c} slug={c} category="cuisine" />
          ))}
          {recipe.course && (
            <TagBadge slug={recipe.course} category="course" />
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {recipe.difficulty && (
            <span className="flex items-center gap-1">
              <ChefHat size={12} />
              {DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty}
            </span>
          )}
          {recipe.total_time && recipe.total_time !== 'unknown' && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {TOTAL_TIME_LABELS[recipe.total_time] ?? recipe.total_time}
            </span>
          )}
          {recipe.course && !recipe.difficulty && !recipe.total_time && (
            <span className="text-xs text-muted-foreground">
              {COURSE_LABELS[recipe.course] ?? recipe.course}
            </span>
          )}
        </div>

        {recipe.key_ingredients.length > 0 && (
          <p className="text-xs text-muted-foreground truncate">
            {recipe.key_ingredients.slice(0, 3).join(', ')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
