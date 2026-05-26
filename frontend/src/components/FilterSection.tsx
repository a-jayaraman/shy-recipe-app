import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterSectionProps {
  title: string
  activeCount?: number
  defaultOpen?: boolean
  children: React.ReactNode
}

export function FilterSection({ title, activeCount = 0, defaultOpen = true, children }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between py-3 text-sm font-medium hover:text-primary transition-colors"
      >
        <span>
          {title}
          {activeCount > 0 && (
            <span className="ml-1.5 text-xs font-semibold text-primary">({activeCount})</span>
          )}
        </span>
        {open
          ? <ChevronDown size={14} className="text-muted-foreground" />
          : <ChevronRight size={14} className="text-muted-foreground" />}
      </button>
      {open && <div className="pb-3 space-y-1">{children}</div>}
    </div>
  )
}

interface SegmentedControlProps {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  allowDeselect?: boolean
}

export function SegmentedControl({ options, value, onChange, allowDeselect = true }: SegmentedControlProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(value === opt.value && allowDeselect ? '' : opt.value)}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
            value === opt.value
              ? 'bg-primary text-white border-primary'
              : 'border-border text-muted-foreground hover:border-primary hover:text-primary bg-background'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

interface ChipListProps {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export function ChipList({ options, selected, onChange }: ChipListProps) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => toggle(opt.value)}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            selected.includes(opt.value)
              ? 'bg-primary text-white border-primary'
              : 'border-border text-muted-foreground hover:border-primary hover:text-primary bg-background'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
