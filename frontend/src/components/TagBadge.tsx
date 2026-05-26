import { Badge } from '@/components/ui/badge'
import { useTagDisplayName } from '@/hooks/useTags'
import { cn } from '@/lib/utils'

export type TagCategory = 'cuisine' | 'course' | 'cooking_method' | 'serve_with' | 'dietary' | 'key_ingredient'

const CATEGORY_CLASSES: Record<TagCategory, string> = {
  cuisine: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100',
  course: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100',
  cooking_method: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100',
  dietary: 'bg-pink-100 text-pink-800 border-pink-200 hover:bg-pink-100',
  serve_with: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100',
  key_ingredient: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-50',
}

interface TagBadgeProps {
  slug: string
  category: TagCategory
  className?: string
}

export function TagBadge({ slug, category, className }: TagBadgeProps) {
  const displayName = useTagDisplayName(slug)
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', CATEGORY_CLASSES[category], className)}
    >
      {displayName}
    </Badge>
  )
}
