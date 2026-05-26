import { Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '@/hooks/useRecommendStream'
import { RecipeCardRow } from './RecipeCardRow'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'rounded-2xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground ml-12 max-w-[80%]'
            : 'bg-muted text-foreground mr-4 max-w-full w-full'
        )}
      >
        {/* Tool call indicators — shown collapsed above text */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
            {message.toolCalls.map((tc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground/70"
              >
                <Wrench size={10} />
                <span className="font-mono">{tc.name}</span>
              </span>
            ))}
          </div>
        )}

        {/* Main text */}
        {(message.content || isStreaming) && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        )}

        {/* Typing indicator when no text yet */}
        {!isUser && isStreaming && !message.content && (
          <div className="flex gap-1 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
          </div>
        )}

        {/* Recipe cards — rendered after streaming completes */}
        {!isUser && message.recipeIds && message.recipeIds.length > 0 && (
          <RecipeCardRow recipeIds={message.recipeIds} />
        )}
      </div>
    </div>
  )
}
