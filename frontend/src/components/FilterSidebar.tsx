import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterSection, SegmentedControl, ChipList } from './FilterSection'
import { IngredientChipCombobox } from './IngredientChipCombobox'
import { useTagDisplayName, useAllTags } from '@/hooks/useTags'
import { COURSE_OPTIONS, DIFFICULTY_OPTIONS, TOTAL_TIME_OPTIONS } from '@/lib/utils'
import type { RecipeFilters } from '@/types/recipe'

interface FilterSidebarProps {
  filters: RecipeFilters
  setFilters: (updates: Partial<RecipeFilters>) => void
  clearFilters: () => void
  hasActiveFilters: boolean
}

function CheckboxList({
  items,
  selected,
  onChange,
}: {
  items: { value: string; display_name: string; count: number }[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
      {items.map(item => (
        <label
          key={item.value}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <Checkbox
            checked={selected.includes(item.value)}
            onCheckedChange={() => toggle(item.value)}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <span className="text-sm text-foreground group-hover:text-primary transition-colors flex-1 truncate">
            <TagLabel slug={item.value} displayName={item.display_name} />
          </span>
          <span className="text-xs text-muted-foreground shrink-0">{item.count}</span>
        </label>
      ))}
    </div>
  )
}

function TagLabel({ slug, displayName }: { slug: string; displayName: string }) {
  const resolved = useTagDisplayName(slug)
  return <>{resolved || displayName}</>
}

function ServeWithChips({
  items,
  selected,
  onChange,
}: {
  items: { value: string; display_name: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  const options = items.map(t => ({ value: t.value, label: t.display_name }))
  return <ChipList options={options} selected={selected} onChange={onChange} />
}

export function FilterSidebar({ filters, setFilters, clearFilters, hasActiveFilters }: FilterSidebarProps) {
  const [localQ, setLocalQ] = useState(filters.q)
  const { data: tagsData } = useAllTags()

  useEffect(() => {
    setLocalQ(filters.q)
  }, [filters.q])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (localQ !== filters.q) {
        setFilters({ q: localQ })
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [localQ, filters.q, setFilters])

  const categories = tagsData?.categories

  return (
    <div className="p-4">
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors mb-3 font-medium"
        >
          <X size={12} />
          Clear all filters
        </button>
      )}

      {/* Search */}
      <FilterSection title="Search" defaultOpen={true}>
        <input
          type="search"
          value={localQ}
          onChange={e => setLocalQ(e.target.value)}
          placeholder="Search recipes..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </FilterSection>

      {/* Cuisine */}
      {categories?.cuisine && categories.cuisine.length > 0 && (
        <FilterSection
          title="Cuisine"
          activeCount={filters.cuisine.length}
          defaultOpen={false}
        >
          <CheckboxList
            items={categories.cuisine}
            selected={filters.cuisine}
            onChange={v => setFilters({ cuisine: v })}
          />
        </FilterSection>
      )}

      {/* Course */}
      <FilterSection
        title="Course"
        activeCount={filters.course ? 1 : 0}
        defaultOpen={false}
      >
        <SegmentedControl
          options={COURSE_OPTIONS}
          value={filters.course}
          onChange={v => setFilters({ course: v })}
        />
      </FilterSection>

      {/* Cooking Method */}
      {categories?.cooking_method && categories.cooking_method.length > 0 && (
        <FilterSection
          title="Cooking Method"
          activeCount={filters.cooking_method.length}
          defaultOpen={false}
        >
          <CheckboxList
            items={categories.cooking_method}
            selected={filters.cooking_method}
            onChange={v => setFilters({ cooking_method: v })}
          />
        </FilterSection>
      )}

      {/* Difficulty */}
      <FilterSection
        title="Difficulty"
        activeCount={filters.difficulty ? 1 : 0}
        defaultOpen={false}
      >
        <SegmentedControl
          options={DIFFICULTY_OPTIONS}
          value={filters.difficulty}
          onChange={v => setFilters({ difficulty: v })}
        />
      </FilterSection>

      {/* Total Time */}
      <FilterSection
        title="Total Time"
        activeCount={filters.total_time ? 1 : 0}
        defaultOpen={false}
      >
        <SegmentedControl
          options={TOTAL_TIME_OPTIONS}
          value={filters.total_time}
          onChange={v => setFilters({ total_time: v })}
        />
      </FilterSection>

      {/* Serve With */}
      {categories?.serve_with && categories.serve_with.length > 0 && (
        <FilterSection
          title="Serve With"
          activeCount={filters.serve_with.length}
          defaultOpen={false}
        >
          <ServeWithChips
            items={categories.serve_with}
            selected={filters.serve_with}
            onChange={v => setFilters({ serve_with: v })}
          />
        </FilterSection>
      )}

      {/* Dietary */}
      {categories?.dietary && categories.dietary.length > 0 && (
        <FilterSection
          title="Dietary"
          activeCount={filters.dietary.length}
          defaultOpen={false}
        >
          <ServeWithChips
            items={categories.dietary}
            selected={filters.dietary}
            onChange={v => setFilters({ dietary: v })}
          />
        </FilterSection>
      )}

      {/* Key Ingredients */}
      <FilterSection
        title="Key Ingredients"
        activeCount={filters.key_ingredient.length}
        defaultOpen={false}
      >
        <p className="text-xs text-muted-foreground mb-2">AND semantics — recipe must have all</p>
        <IngredientChipCombobox
          selected={filters.key_ingredient}
          onChange={v => setFilters({ key_ingredient: v })}
        />
      </FilterSection>
    </div>
  )
}
