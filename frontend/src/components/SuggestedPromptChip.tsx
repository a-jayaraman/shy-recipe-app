interface SuggestedPromptChipProps {
  label: string
  onClick: (label: string) => void
  disabled?: boolean
}

export function SuggestedPromptChip({ label, onClick, disabled }: SuggestedPromptChipProps) {
  return (
    <button
      onClick={() => onClick(label)}
      disabled={disabled}
      className="px-3 py-1.5 text-sm rounded-full border border-border bg-muted/50
                 hover:bg-muted text-muted-foreground hover:text-foreground
                 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}
