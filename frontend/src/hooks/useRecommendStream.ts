import { useState, useCallback, useRef, useEffect } from 'react'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  recipeIds?: number[]
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>
  /** Byte offset in content where "thinking" ends and the final response begins */
  thinkingBoundary?: number
}

export type StreamState = 'idle' | 'streaming' | 'error'

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1'

export function useRecommendStream(model: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamState, setStreamState] = useState<StreamState>('idle')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Keep a ref so sendMessage can read the latest messages without being in its dep array
  const messagesRef = useRef<ChatMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const sendMessage = useCallback(async (userText: string) => {
    // Snapshot current history + new user message
    const historyWithUser: ChatMessage[] = [
      ...messagesRef.current,
      { role: 'user', content: userText },
    ]
    // Index where the assistant placeholder will live
    const assistantIdx = historyWithUser.length

    setMessages([...historyWithUser, { role: 'assistant', content: '' }])
    setStreamState('streaming')
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    // API only needs role + content
    const apiMessages = historyWithUser.map(m => ({ role: m.role, content: m.content }))

    let resp: Response
    try {
      resp = await fetch(`${BASE_URL}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, model }),
        signal: controller.signal,
      })
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      setStreamState('error')
      setError((err as Error).message)
      return
    }

    if (!resp.ok || !resp.body) {
      setStreamState('error')
      setError(`Server error: ${resp.status}`)
      return
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let lineBuffer = ''

    function handleEvent(event: Record<string, unknown>) {
      switch (event.type) {
        case 'text_delta':
          setMessages(prev =>
            prev.map((m, i) =>
              i === assistantIdx ? { ...m, content: m.content + (event.delta as string) } : m
            )
          )
          break
        case 'tool_call':
          setMessages(prev =>
            prev.map((m, i) =>
              i === assistantIdx
                ? {
                    ...m,
                    // Everything accumulated so far becomes "thinking"
                    thinkingBoundary: m.content.length,
                    toolCalls: [
                      ...(m.toolCalls ?? []),
                      {
                        name: event.name as string,
                        args: (event.args ?? {}) as Record<string, unknown>,
                      },
                    ],
                  }
                : m
            )
          )
          break
        case 'recipe_ids':
          setMessages(prev =>
            prev.map((m, i) =>
              i === assistantIdx ? { ...m, recipeIds: event.ids as number[] } : m
            )
          )
          break
        case 'error':
          setStreamState('error')
          setError(event.message as string)
          break
        case 'done':
          setStreamState('idle')
          break
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        lineBuffer += decoder.decode(value, { stream: true })

        // SSE events are delimited by \n\n; keep incomplete trailing part
        const parts = lineBuffer.split('\n\n')
        lineBuffer = parts.pop() ?? ''

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            let event: Record<string, unknown>
            try {
              event = JSON.parse(raw)
            } catch {
              continue
            }
            handleEvent(event)
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setStreamState('error')
        setError((err as Error).message)
      }
    } finally {
      setStreamState(s => (s === 'streaming' ? 'idle' : s))
    }
  }, [model])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setStreamState('idle')
    setError(null)
  }, [])

  return { messages, streamState, error, sendMessage, reset }
}
