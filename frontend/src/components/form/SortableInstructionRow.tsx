import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { InstructionRow } from './InstructionRow'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { RecipeFormValues } from '@/lib/recipeSchema'

interface SortableInstructionRowProps {
  id: string
  index: number
  register: UseFormRegister<RecipeFormValues>
  errors: FieldErrors<RecipeFormValues>
  onRemove: () => void
}

export function SortableInstructionRow({ id, ...rowProps }: SortableInstructionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <InstructionRow
        {...rowProps}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
        isDragging={isDragging}
      />
    </div>
  )
}
