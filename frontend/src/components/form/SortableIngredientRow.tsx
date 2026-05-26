import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IngredientRow } from './IngredientRow'
import type { Control, UseFormRegister, FieldErrors } from 'react-hook-form'
import type { RecipeFormValues } from '@/lib/recipeSchema'

interface SortableIngredientRowProps {
  id: string
  index: number
  control: Control<RecipeFormValues>
  register: UseFormRegister<RecipeFormValues>
  errors: FieldErrors<RecipeFormValues>
  onRemove: () => void
}

export function SortableIngredientRow({ id, ...rowProps }: SortableIngredientRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <IngredientRow
        {...rowProps}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
        isDragging={isDragging}
      />
    </div>
  )
}
