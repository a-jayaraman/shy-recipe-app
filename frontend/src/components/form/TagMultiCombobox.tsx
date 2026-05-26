import { useState, useMemo } from 'react'
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { X, Search, AlertTriangle } from 'lucide-react'
import { useAllTags, useTagAliases } from '@/hooks/useTags'

type TagCategory = 'cuisine' | 'cooking_method' | 'serve_with' | 'dietary' | 'key_ingredient'

const CATEGORY_LABELS: Record<TagCategory, string> = {
  cuisine: 'cuisine',
  cooking_method: 'cooking method',
  serve_with: 'serve with',
  dietary: 'dietary',
  key_ingredient: 'key ingredient',
}

interface TagMultiComboboxProps {
  category: TagCategory
  selected: string[]
  onChange: (selected: string[]) => void
  allowNew?: boolean
  placeholder?: string
}

export function TagMultiCombobox({
  category,
  selected,
  onChange,
  allowNew = false,
  placeholder,
}: TagMultiComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [hasNewValues, setHasNewValues] = useState(false)

  const { data: tagsData } = useAllTags()
  const { data: tagAliasMap } = useTagAliases()

  const options = tagsData?.categories[category] ?? []

  const getDisplayName = (slug: string): string => {
    if (tagAliasMap?.[slug]) return tagAliasMap[slug]
    const found = options.find(o => o.value === slug)
    return found?.display_name ?? slug
  }

  const suggestions = useMemo(() => {
    const query = inputValue.toLowerCase().trim()
    if (!query) return options.filter(o => !selected.includes(o.value)).slice(0, 20)

    return options
      .filter(o => !selected.includes(o.value))
      .filter(o =>
        o.value.toLowerCase().includes(query) ||
        o.display_name.toLowerCase().includes(query)
      )
      .slice(0, 20)
  }, [inputValue, options, selected])

  const trimmedInput = inputValue.trim()
  const isExactMatch = options.some(
    o => o.value.toLowerCase() === trimmedInput.toLowerCase() ||
         o.display_name.toLowerCase() === trimmedInput.toLowerCase()
  )
  const isAlreadySelected = selected.some(
    s => s.toLowerCase() === trimmedInput.toLowerCase()
  )
  const showAddNew = allowNew && trimmedInput.length > 0 && !isExactMatch && !isAlreadySelected

  // Check if input matches a known alias → suggest canonical
  const aliasMatch = useMemo(() => {
    if (!tagAliasMap || !trimmedInput) return null
    const entry = Object.entries(tagAliasMap).find(
      ([slug]) => slug.toLowerCase() === trimmedInput.toLowerCase()
    )
    return entry ? { slug: entry[0], display: entry[1] } : null
  }, [trimmedInput, tagAliasMap])

  const handleSelect = (value: string) => {
    if (!selected.includes(value)) {
      onChange([...selected, value])
    }
    setInputValue('')
    setOpen(false)
  }

  const handleAddNew = () => {
    const val = trimmedInput.toLowerCase()
    if (!selected.includes(val)) {
      onChange([...selected, val])
      setHasNewValues(true)
    }
    setInputValue('')
    setOpen(false)
  }

  const handleRemove = (value: string) => {
    onChange(selected.filter(s => s !== value))
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(slug => (
            <Badge key={slug} variant="secondary" className="gap-1 text-xs pl-2 pr-1">
              {getDisplayName(slug)}
              <button
                type="button"
                onClick={() => handleRemove(slug)}
                className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                aria-label={`Remove ${getDisplayName(slug)}`}
              >
                <X size={10} />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:border-primary transition-colors text-left"
          >
            <Search size={14} />
            <span>{placeholder ?? `Search ${CATEGORY_LABELS[category]}...`}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Type to search or add...`}
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              <CommandEmpty>
                {showAddNew ? null : 'No matching values.'}
              </CommandEmpty>

              {aliasMatch && !isAlreadySelected && (
                <CommandItem
                  value={aliasMatch.slug}
                  onSelect={() => handleSelect(aliasMatch.slug)}
                  className="flex flex-col items-start py-2"
                >
                  <span className="font-medium">{aliasMatch.display}</span>
                  <span className="text-xs text-muted-foreground">
                    recognized alias for &ldquo;{trimmedInput}&rdquo;
                  </span>
                </CommandItem>
              )}

              {suggestions.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={() => handleSelect(opt.value)}
                >
                  {opt.display_name}
                </CommandItem>
              ))}

              {showAddNew && (
                <CommandItem
                  value={`__new__${trimmedInput}`}
                  onSelect={handleAddNew}
                  className="flex flex-col items-start py-2 text-amber-600"
                >
                  <span className="font-medium">Add &ldquo;{trimmedInput}&rdquo; as new value</span>
                  <span className="text-xs opacity-75">This is a new value not yet in the database</span>
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {hasNewValues && (
        <p className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle size={11} />
          New values will be created on save
        </p>
      )}
    </div>
  )
}
