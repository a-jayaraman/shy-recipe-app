import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Send, Loader2, Check, X, RotateCcw } from 'lucide-react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatMessage } from '@/components/ChatMessage'
import { SuggestedPromptChip } from '@/components/SuggestedPromptChip'
import { useRecommendStream } from '@/hooks/useRecommendStream'
import { apiClient } from '@/api/client'

const DEFAULT_MODEL = '~anthropic/claude-haiku-latest'

const SUGGESTED_PROMPTS = [
  'Quick weeknight dinner',
  'Something Indian with rice',
  'Vegan and gluten-free',
  'Use up the paneer in my fridge',
  'Something I haven\'t made in a while',
]

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid'

export function RecommendPage() {
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [validationState, setValidationState] = useState<ValidationState>('idle')
  const [modelDisplayName, setModelDisplayName] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validateAbortRef = useRef<AbortController | null>(null)
  const isFirstRender = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, streamState, error, sendMessage, reset } = useRecommendStream(model)
  const isStreaming = streamState === 'streaming'
  const canSubmit = inputText.trim().length > 0 && !isStreaming && validationState === 'valid'

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [inputText])

  const validateModel = useCallback(async (modelId: string) => {
    // Cancel any in-flight validation request
    validateAbortRef.current?.abort()
    const controller = new AbortController()
    validateAbortRef.current = controller

    if (!modelId.trim()) {
      setValidationState('invalid')
      setValidationError(null)
      setModelDisplayName(null)
      return
    }
    setValidationState('validating')
    setValidationError(null)
    try {
      const { data } = await apiClient.get<{ valid: boolean; display_name: string | null }>(
        '/recommend/validate-model',
        { params: { model_id: modelId }, signal: controller.signal }
      )
      if (controller.signal.aborted) return
      if (data?.valid) {
        setValidationState('valid')
        setModelDisplayName(data.display_name)
        setValidationError(null)
      } else {
        setValidationState('invalid')
        setModelDisplayName(null)
        setValidationError('Model not found on OpenRouter')
      }
    } catch (err: unknown) {
      // Ignore cancellations — a newer request is already in flight
      if (axios.isCancel(err)) return
      setValidationState('invalid')
      setModelDisplayName(null)
      // Distinguish network/server errors from model-not-found
      const isNetworkErr =
        axios.isAxiosError(err) &&
        (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED' || !err.response)
      setValidationError(isNetworkErr ? 'Could not reach server' : 'Validation failed')
    }
  }, [])

  // Cancel validation on unmount
  useEffect(() => {
    return () => { validateAbortRef.current?.abort() }
  }, [])

  // Validate immediately on first render; debounce 500 ms for subsequent model changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const delay = isFirstRender.current ? 0 : 500
    isFirstRender.current = false
    debounceRef.current = setTimeout(() => validateModel(model), delay)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [model, validateModel])

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || isStreaming || validationState !== 'valid') return
    setInputText('')
    sendMessage(text)
  }, [inputText, isStreaming, validationState, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChipClick = (label: string) => {
    if (isStreaming || validationState !== 'valid') return
    sendMessage(label)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              Recipes
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <h1 className="font-serif text-lg font-semibold text-primary">What should I cook?</h1>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/recipe/new" className="gap-1.5">
              <Plus size={14} />
              New Recipe
            </Link>
          </Button>
        </div>
      </header>

      {/* Model selector bar */}
      <div className="border-b border-border bg-muted/30">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0 select-none">Model:</label>
          <div className="relative max-w-xs flex-1">
            <Input
              value={model}
              onChange={e => setModel(e.target.value)}
              className="h-7 text-xs pr-7 font-mono"
              placeholder="~anthropic/claude-haiku-latest"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              {validationState === 'validating' && (
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              )}
              {validationState === 'valid' && <Check size={12} className="text-green-600" />}
              {validationState === 'invalid' && <X size={12} className="text-destructive" />}
            </div>
          </div>
          {modelDisplayName && validationState === 'valid' && (
            <span className="text-xs text-muted-foreground truncate max-w-[8rem]" title={modelDisplayName}>
              {modelDisplayName}
            </span>
          )}
          {validationState === 'invalid' && validationError && (
            <span className="text-xs text-destructive" title={validationError}>
              {validationError}
            </span>
          )}
        </div>
      </div>

      {/* Messages area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="text-center py-16">
              <p className="font-serif text-2xl font-semibold text-primary mb-2">
                What should I cook?
              </p>
              <p className="text-muted-foreground text-sm mb-8">
                Ask in plain English. I&apos;ll search through your recipes.
              </p>
              {validationState === 'valid' ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map(p => (
                    <SuggestedPromptChip
                      key={p}
                      label={p}
                      onClick={handleChipClick}
                      disabled={isStreaming}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {validationState === 'validating'
                    ? 'Validating model…'
                    : 'Enter a valid model name above to get started.'}
                </p>
              )}
            </div>
          ) : (
            /* Chat messages */
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  message={msg}
                  isStreaming={
                    isStreaming && i === messages.length - 1 && msg.role === 'assistant'
                  }
                />
              ))}
              {error && (
                <p className="text-center text-sm text-destructive py-2">{error}</p>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input bar */}
      <footer className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                validationState !== 'valid'
                  ? 'Waiting for model validation…'
                  : 'What are you in the mood for? (Enter to send, Shift+Enter for newline)'
              }
              disabled={isStreaming || validationState !== 'valid'}
              rows={1}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2
                         text-sm ring-offset-background placeholder:text-muted-foreground
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                         focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed
                         overflow-hidden min-h-[2.5rem]"
            />
            <Button
              onClick={handleSend}
              disabled={!canSubmit}
              size="icon"
              className="shrink-0"
            >
              {isStreaming ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </Button>
          </div>
          {messages.length > 0 && (
            <div className="flex justify-end mt-1.5">
              <button
                onClick={reset}
                disabled={isStreaming}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw size={11} />
                Clear conversation
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
