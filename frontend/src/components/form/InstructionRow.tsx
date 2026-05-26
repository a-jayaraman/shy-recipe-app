import { GripVertical, X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { cn } from '@/lib/utils'
import type { RecipeFormValues } from '@/lib/recipeSchema'

interface InstructionRowProps {
  index: number
  register: UseFormRegister<RecipeFormValues>
  errors: FieldErrors<RecipeFormValues>
  onRemove: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
  isDragging?: boolean
}

export function InstructionRow({
  index,
  register,
  errors,
  onRemove,
  dragHandleProps,
  isDragging,
}: InstructionRowProps) {
  const textError = (errors.instructions as any)?.[index]?.text?.message as string | undefined

  return (
    <div className={cn('flex gap-2 items-start', isDragging && 'opacity-50')}>
      {/* Drag handle */}
      <button
        type="button"
        className="mt-2.5 text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
        {...dragHandleProps}
      >
        <GripVertical size={16} />
      </button>

      {/* Step number */}
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center mt-2.5">
        {index + 1}
      </span>

      {/* Step text */}
      <div className="flex-1 min-w-0">
        <Textarea
          {...register(`instructions.${index}.text`)}
          placeholder={`Step ${index + 1}...`}
          rows={2}
          className={cn('resize-none', textError && 'border-destructive')}
        />
        {textError && (
          <p className="text-xs text-destructive mt-0.5">{textError}</p>
        )}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="mt-2.5 text-muted-foreground hover:text-destructive transition-colors"
        aria-label="Remove step"
      >
        <X size={16} />
      </button>
    </div>
  )
}
