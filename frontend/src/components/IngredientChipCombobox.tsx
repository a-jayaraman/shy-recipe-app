import { useState, useMemo } from 'react'
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { X, Search } from 'lucide-react'
import { useAllTags, useIngredientAliases } from '@/hooks/useTags'
import { cn } from '@/lib/utils'

interface ComboboxEntry {
  canonical: string
  matchedAlias: string | null
}

interface IngredientChipComboboxProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export function IngredientChipCombobox({ selected, onChange }: IngredientChipComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const { data: tagsData } = useAllTags()
  const { data: aliasMap } = useIngredientAliases()

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

  const canonicals = tagsData?.categories.key_ingredient ?? []

  const suggestions = useMemo<ComboboxEntry[]>(() => {
    if (!inputValue.trim()) return []
    const query = inputValue.toLowerCase()
    const results: ComboboxEntry[] = []
    const seen = new Set<string>()

    for (const tag of canonicals) {
      if (selected.includes(tag.value)) continue

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

    return results.slice(0, 20)
  }, [inputValue, canonicals, reverseAliasMap, selected])

  const handleSelect = (entry: ComboboxEntry) => {
    onChange([...selected, entry.canonical])
    setInputValue('')
    setOpen(false)
  }

  const handleRemove = (canonical: string) => {
    onChange(selected.filter(s => s !== canonical))
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(canonical => (
            <Badge key={canonical} variant="secondary" className="gap-1 text-xs pl-2 pr-1">
              {canonical}
              <button
                onClick={() => handleRemove(canonical)}
                className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                aria-label={`Remove ${canonical}`}
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
            className={cn(
              'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:border-primary transition-colors text-left'
            )}
          >
            <Search size={14} />
            <span>Search ingredients...</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type an ingredient or alias..."
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              <CommandEmpty>No matching ingredients.</CommandEmpty>
              {suggestions.map(entry => (
                <CommandItem
                  key={entry.canonical}
                  value={entry.canonical}
                  onSelect={() => handleSelect(entry)}
                  className="flex flex-col items-start py-2"
                >
                  <span className="font-medium">{entry.canonical}</span>
                  {entry.matchedAlias && (
                    <span className="text-xs text-muted-foreground">
                      also known as &ldquo;{entry.matchedAlias}&rdquo;
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
