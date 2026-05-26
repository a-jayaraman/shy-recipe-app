import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useParseRecipe } from '@/hooks/useRecipes'
import type { ParseRecipeResponse } from '@/types/recipe'

interface LlmAssistModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResult: (result: ParseRecipeResponse) => void
}

export function LlmAssistModal({ open, onOpenChange, onResult }: LlmAssistModalProps) {
  const [text, setText] = useState('')
  const { mutate: parseRecipe, isPending, error } = useParseRecipe()

  const handleParse = () => {
    if (!text.trim()) return
    parseRecipe(text, {
      onSuccess: (result) => {
        onResult(result)
        onOpenChange(false)
        setText('')
        toast.success('Form pre-filled from pasted text')
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.detail ?? err?.message ?? 'Parse failed'
        toast.error(`Could not parse recipe: ${msg}`)
      },
    })
  }

  const charCount = text.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            Paste recipe text
          </DialogTitle>
          <DialogDescription>
            Paste any recipe text (from a website, email, or notes). Claude will extract the
            structured fields and pre-fill the form for you to review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste recipe text here..."
            rows={10}
            className="resize-none"
            disabled={isPending}
          />

          {charCount > 10_000 && (
            <p className="text-xs text-amber-600">
              {charCount.toLocaleString()} characters — large pastes may take a moment
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive">
              {(error as any)?.response?.data?.detail ?? (error as any)?.message ?? 'Something went wrong'}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleParse} disabled={!text.trim() || isPending}>
              {isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-2" />
                  Parsing…
                </>
              ) : (
                <>
                  <Sparkles size={14} className="mr-2" />
                  Parse with Claude
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
