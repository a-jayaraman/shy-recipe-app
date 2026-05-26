import { useState, useMemo } from 'react'
import { Command, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { GripVertical, X } from 'lucide-react'
import { Controller } from 'react-hook-form'
import type { Control, UseFormRegister, FieldErrors } from 'react-hook-form'
import { useAllTags, useIngredientAliases } from '@/hooks/useTags'
import { cn } from '@/lib/utils'
import { UNIT_OPTIONS } from '@/lib/recipeSchema'
import type { RecipeFormValues } from '@/lib/recipeSchema'

interface IngredientRowProps {
  index: number
  control: Control<RecipeFormValues>
  register: UseFormRegister<RecipeFormValues>
  errors: FieldErrors<RecipeFormValues>
  onRemove: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
  isDragging?: boolean
}

export function IngredientRow({
  index,
  control,
  register,
  errors,
  onRemove,
  dragHandleProps,
  isDragging,
}: IngredientRowProps) {
  const [nameOpen, setNameOpen] = useState(false)
  const [nameInput, setNameInput] = useState('')

  const { data: tagsData } = useAllTags()
  const { data: aliasMap } = useIngredientAliases()

  const keyIngredients = tagsData?.categories.key_ingredient ?? []

  const reverseAliasMap = useMemo<Record<string, string[]>>(() => {
    if (!aliasMap) return {}
    const result: Record<string, string[]> = {}
    for (const [alias, canonical] of Object.entries(aliasMap)) {
      if (alias !== canonical) {
        if (!result[canonical]) result[canonical] = []
        result[canonical].push(alias)
      }
    }
    return result
  }, [aliasMap])

  const nameSuggestions = useMemo(() => {
    const query = nameInput.toLowerCase().trim()
    if (!query) return []

    const results: { canonical: string; matchedAlias: string | null }[] = []
    const seen = new Set<string>()

    // First: match from key_ingredient tags
    for (const tag of keyIngredients) {
      const canonicalMatch =
        tag.value.toLowerCase().includes(query) ||
        tag.display_name.toLowerCase().includes(query)

      if (canonicalMatch && !seen.has(tag.value)) {
        results.push({ canonical: tag.value, matchedAlias: null })
        seen.add(tag.value)
        continue
      }

      const aliases = reverseAliasMap[tag.value] ?? []
      for (const alias of aliases) {
        if (alias.toLowerCase().includes(query) && !seen.has(tag.value)) {
          results.push({ canonical: tag.value, matchedAlias: alias })
          seen.add(tag.value)
          break
        }
      }
    }

    // Also match direct alias lookups (e.g. "hing" → "asafoetida" even if not in key_ingredient)
    if (aliasMap) {
      for (const [alias, canonical] of Object.entries(aliasMap)) {
        if (alias !== canonical && alias.toLowerCase().includes(query) && !seen.has(canonical)) {
          results.push({ canonical, matchedAlias: alias })
          seen.add(canonical)
        }
      }
    }

    return results.slice(0, 10)
  }, [nameInput, keyIngredients, reverseAliasMap, aliasMap])

  const nameError = (errors.ingredients as any)?.[index]?.name?.message as string | undefined

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

      <div className="flex gap-2 flex-1 flex-wrap sm:flex-nowrap">
        {/* Amount */}
        <Input
          {...register(`ingredients.${index}.amount`)}
          placeholder="Amount"
          className="w-20 shrink-0"
        />

        {/* Unit */}
        <Controller
          control={control}
          name={`ingredients.${index}.unit`}
          render={({ field }) => (
            <Select
              value={field.value || '__none__'}
              onValueChange={v => field.onChange(v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="w-28 shrink-0">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— none —</SelectItem>
                {UNIT_OPTIONS.filter(u => u !== '').map(u => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />

        {/* Name — alias-aware autocomplete */}
        <div className="flex-1 min-w-0">
          <Controller
            control={control}
            name={`ingredients.${index}.name`}
            render={({ field }) => (
              <Popover open={nameOpen} onOpenChange={setNameOpen}>
                <PopoverTrigger asChild>
                  <div className="w-full">
                    <Input
                      value={field.value}
                      onChange={e => {
                        field.onChange(e)
                        setNameInput(e.target.value)
                        if (!nameOpen && e.target.value) setNameOpen(true)
                      }}
                      onFocus={() => { if (field.value) setNameOpen(true) }}
                      placeholder="Ingredient name"
                      className={cn(nameError && 'border-destructive')}
                      autoComplete="off"
                    />
                  </div>
                </PopoverTrigger>
                {nameSuggestions.length > 0 && (
                  <PopoverContent className="w-64 p-0" align="start" onOpenAutoFocus={e => e.preventDefault()}>
                    <Command shouldFilter={false}>
                      <CommandList>
                        <CommandEmpty>No suggestions.</CommandEmpty>
                        {nameSuggestions.map(entry => (
                          <CommandItem
                            key={entry.canonical}
                            value={entry.canonical}
                            onSelect={() => {
                              field.onChange(entry.canonical)
                              setNameInput(entry.canonical)
                              setNameOpen(false)
                            }}
                            className="flex flex-col items-start py-2"
                          >
                            <span className="font-medium">{entry.canonical}</span>
                            {entry.matchedAlias && (
                              <span className="text-xs text-muted-foreground">
                                recognized alias for &ldquo;{entry.matchedAlias}&rdquo;
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                )}
              </Popover>
            )}
          />
          {nameError && (
            <p className="text-xs text-destructive mt-0.5">{nameError}</p>
          )}
        </div>

        {/* Notes */}
        <Input
          {...register(`ingredients.${index}.notes`)}
          placeholder="Notes (optional)"
          className="w-32 shrink-0"
        />
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="mt-2.5 text-muted-foreground hover:text-destructive transition-colors"
        aria-label="Remove ingredient"
      >
        <X size={16} />
      </button>
    </div>
  )
}
