import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CookingModeOverlayProps {
  instructions: string[]
  onClose: () => void
}

export function CookingModeOverlay({ instructions, onClose }: CookingModeOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [done, setDone] = useState<Set<number>>(new Set())

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const toggleDone = (i: number) => {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Cooking Mode"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-white/10">
        <span className="text-white/60 text-sm font-medium">
          Step {currentStep + 1} of {instructions.length}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs">Press Esc to exit</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/10"
          >
            <X size={18} />
          </Button>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 max-w-2xl mx-auto w-full">
        {instructions.map((step, i) => (
          <div
            key={i}
            onClick={() => setCurrentStep(i)}
            className={cn(
              'transition-all duration-300 cursor-pointer rounded-lg p-4',
              i === currentStep
                ? 'opacity-100'
                : 'opacity-20 hover:opacity-40'
            )}
          >
            <div className="flex items-start gap-4">
              <button
                onClick={(e) => { e.stopPropagation(); toggleDone(i) }}
                className={cn(
                  'mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors',
                  done.has(i)
                    ? 'bg-green-500 border-green-500'
                    : 'border-white/30 hover:border-white/60'
                )}
              >
                {done.has(i) && <Check size={12} className="text-white" />}
              </button>
              <p className={cn(
                'text-white leading-relaxed',
                i === currentStep ? 'text-xl' : 'text-base',
                done.has(i) && 'line-through text-white/40'
              )}>
                {step}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-6 py-5 border-t border-white/10">
        <Button
          onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          variant="outline"
          className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white disabled:opacity-30"
        >
          <ChevronLeft size={16} />
          Previous
        </Button>
        <span className="text-white/40 text-sm w-20 text-center">
          {currentStep + 1} / {instructions.length}
        </span>
        <Button
          onClick={() => setCurrentStep(s => Math.min(instructions.length - 1, s + 1))}
          disabled={currentStep === instructions.length - 1}
          className="bg-primary text-white hover:bg-primary/90 disabled:opacity-30"
        >
          Next
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  )
}
