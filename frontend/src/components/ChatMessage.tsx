import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '@/hooks/useRecommendStream'
import { RecipeCardRow } from './RecipeCardRow'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
}

const RECIPE_IDS_RE = /\s*\{\s*"recipe_ids"\s*:\s*\[[^\]]*\]\s*\}\s*$/

function stripRecipeIds(text: string): string {
  return text.replace(RECIPE_IDS_RE, '')
}

function ThinkingBox({ text, searchCount }: { text: string; searchCount: number }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-3 rounded-lg border border-border/50 bg-background/50 text-xs overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        <ChevronRight
          size={12}
          className={cn('shrink-0 transition-transform', open && 'rotate-90')}
        />
        <span>
          Searched {searchCount} {searchCount === 1 ? 'time' : 'times'}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-border/50">
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground/60 font-mono text-[11px]">
            {text}
          </p>
        </div>
      )}
    </div>
  )
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="rounded-2xl px-4 py-3 bg-primary text-primary-foreground ml-12 max-w-[80%]">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  const { content, thinkingBoundary, toolCalls, recipeIds } = message

  const thinkingText =
    thinkingBoundary != null ? content.slice(0, thinkingBoundary).trim() : ''
  const responseText = stripRecipeIds(
    thinkingBoundary != null ? content.slice(thinkingBoundary) : content
  ).trim()

  const searchCount = toolCalls?.length ?? 0
  const showThinking = thinkingText.length > 0
  const showResponse = responseText.length > 0
  const showTyping = isStreaming && !showResponse && !showThinking

  return (
    <div className="flex justify-start">
      <div className="rounded-2xl px-4 py-3 bg-muted text-foreground mr-4 max-w-full w-full">
        {/* Collapsible thinking box */}
        {showThinking && (
          <ThinkingBox text={thinkingText} searchCount={searchCount} />
        )}

        {/* Typing dots when no content yet */}
        {showTyping && (
          <div className="flex gap-1 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
          </div>
        )}

        {/* Markdown response */}
        {(showResponse || (isStreaming && thinkingBoundary != null)) && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em>{children}</em>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="text-sm">{children}</li>,
                h1: ({ children }) => <h1 className="text-base font-semibold mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                code: ({ children }) => (
                  <code className="bg-muted-foreground/10 rounded px-1 py-0.5 font-mono text-xs">
                    {children}
                  </code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic">
                    {children}
                  </blockquote>
                ),
                a: ({ href, children }) => (
                  <a href={href} className="text-primary underline hover:no-underline" target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {responseText}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Recipe cards */}
        {recipeIds && recipeIds.length > 0 && (
          <RecipeCardRow recipeIds={recipeIds} />
        )}
      </div>
    </div>
  )
}
