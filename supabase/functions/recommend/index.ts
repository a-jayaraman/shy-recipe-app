// Supabase Edge Function: recommend
// Streams AI recipe recommendations via SSE using OpenRouter.
// Mirrors the Python orchestrator.py + tools.py logic.

import { createClient } from 'npm:@supabase/supabase-js@2'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const MAX_ROUNDS = 20

const SYSTEM_PROMPT = `You are a helpful cooking assistant for a personal recipe collection. Your job is to recommend \
recipes from this collection — and ONLY from this collection — based on what the user is in the \
mood for or what they have on hand.

Tools available:
- search_recipes: filter and search the collection
- get_recipe: fetch full detail of a single recipe
- list_available_filter_values: discover what cuisines, ingredients, etc. exist

Approach:
1. Parse the user's intent (mood, ingredients available, time constraints, dietary needs, cuisine preference).
2. Call search_recipes with reasonable filters. If you get too few or zero results, broaden — drop \
the most restrictive filter and try again. If you get too many, narrow.
3. If you're unsure what filter values to use (e.g., user mentions an ingredient or cuisine you're \
not sure exists in the collection), call list_available_filter_values first.
4. Pick 2-4 recipes to recommend. Briefly explain WHY each is a good match in 1-2 sentences per recipe.
5. End your response with a JSON object: {"recipe_ids": [list of recommended ids]}

Tone: friendly, concise, like a knowledgeable friend. Never invent recipes that aren't in the \
collection. If nothing matches, say so honestly and suggest the closest alternatives or how the \
user could broaden their search.

The collection is mostly vegetarian Indian, Italian, Chinese, and Mexican recipes, ~150 total.

Ingredient vocabulary note: this collection uses canonical ingredient names. Common aliases are \
automatically resolved by the search tools — for example, searching for "hing" finds "asafoetida" \
recipes, "capsicum" finds "bell pepper" recipes. You can use common names freely; the tools will \
handle normalisation. When a user mentions an ingredient by an unfamiliar name, try searching for \
it — it may be an alias the system recognises.`

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'search_recipes',
      description:
        'Search the recipe collection by any combination of filters. Returns up to 20 recipes with summary info.',
      parameters: {
        type: 'object',
        properties: {
          cuisine:         { type: 'array', items: { type: 'string' }, description: 'OR within field. Examples: Indian, South Indian, Italian' },
          course:          { type: 'string', enum: ['main','side','breakfast','soup','salad','condiment','dessert','snack','spice-mix','drink'] },
          cooking_method:  { type: 'array', items: { type: 'string' } },
          serve_with:      { type: 'array', items: { type: 'string' } },
          dietary:         { type: 'array', items: { type: 'string' } },
          key_ingredient:  { type: 'array', items: { type: 'string' }, description: 'AND within field — recipe must contain ALL listed ingredients' },
          has_ingredient:  { type: 'array', items: { type: 'string' }, description: 'Looser ingredient match (matches partial names)' },
          difficulty:      { type: 'string', enum: ['easy','medium','hard'] },
          total_time:      { type: 'string', enum: ['under-30-min','30-60-min','1-2-hrs','over-2-hrs','unknown'] },
          q:               { type: 'string', description: 'Free text search across title and ingredient names' },
          limit:           { type: 'integer', default: 20 },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recipe',
      description: 'Fetch the full details of a single recipe (all ingredients, all instructions, all tags).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_available_filter_values',
      description: 'List the unique values available for a given filter category.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['cuisine', 'cooking_method', 'serve_with', 'dietary', 'key_ingredient', 'course'],
          },
        },
        required: ['category'],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(name: string, args: Record<string, any>, supabase: any): Promise<string> {
  if (name === 'search_recipes') {
    const params: Record<string, unknown> = {
      p_limit: Math.min(Number(args.limit ?? 20), 20),
      p_offset: 0,
    }
    if (args.q)               params.p_q = args.q
    if (args.course)          params.p_course = args.course
    if (args.difficulty)      params.p_difficulty = args.difficulty
    if (args.total_time)      params.p_total_time = args.total_time
    if (args.cuisine?.length)        params.p_cuisine = args.cuisine
    if (args.cooking_method?.length) params.p_cooking_method = args.cooking_method
    if (args.serve_with?.length)     params.p_serve_with = args.serve_with
    if (args.dietary?.length)        params.p_dietary = args.dietary
    if (args.key_ingredient?.length) params.p_key_ingredient = args.key_ingredient
    if (args.has_ingredient?.length) params.p_has_ingredient = args.has_ingredient

    const { data, error } = await supabase.rpc('search_recipes', params)
    if (error) return JSON.stringify({ error: error.message })

    const rows = (data ?? []) as Array<Record<string, unknown>>
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0
    const results = rows.map(r => ({
      id: Number(r.id),
      title: r.title_clean,
      course: r.course,
      difficulty: r.difficulty,
      total_time: r.total_time,
      cuisine: r.cuisine,
      cooking_method: r.cooking_method,
      serve_with: r.serve_with,
      dietary: r.dietary,
      key_ingredients: r.key_ingredients,
    }))
    return JSON.stringify({ total, returned: results.length, results })
  }

  if (name === 'get_recipe') {
    const id = Number(args.id)
    const { data, error } = await supabase
      .from('recipes')
      .select('*, ingredients(order_idx,amount,unit,name,notes), instructions(order_idx,text), recipe_tags(tags(category,value))')
      .eq('id', id)
      .single()

    if (error || !data) return JSON.stringify({ error: `Recipe ${id} not found` })

    const tagsMap: Record<string, string[]> = {}
    for (const rt of (data.recipe_tags ?? []) as Array<{ tags: { category: string; value: string } | null }>) {
      if (!rt.tags) continue
      const { category, value } = rt.tags
      if (!tagsMap[category]) tagsMap[category] = []
      tagsMap[category].push(value)
    }

    return JSON.stringify({
      id: data.id,
      title: data.title_clean,
      author: data.author,
      servings: data.servings,
      course: data.course,
      difficulty: data.difficulty,
      total_time: data.total_time,
      notes: data.notes,
      cuisine: tagsMap['cuisine'] ?? [],
      cooking_method: tagsMap['cooking_method'] ?? [],
      serve_with: tagsMap['serve_with'] ?? [],
      dietary: tagsMap['dietary'] ?? [],
      key_ingredients: tagsMap['key_ingredient'] ?? [],
      ingredients: ((data.ingredients ?? []) as Array<Record<string, unknown>>)
        .sort((a, b) => (a.order_idx as number) - (b.order_idx as number))
        .map(i => ({ amount: i.amount, unit: i.unit, name: i.name, notes: i.notes })),
      instructions: ((data.instructions ?? []) as Array<Record<string, unknown>>)
        .sort((a, b) => (a.order_idx as number) - (b.order_idx as number))
        .map(i => i.text),
    })
  }

  if (name === 'list_available_filter_values') {
    const category = args.category as string
    const { data: tags, error } = await supabase
      .from('tags')
      .select('value')
      .eq('category', category)

    if (error) return JSON.stringify({ error: error.message })

    if (category === 'key_ingredient') {
      const { data: aliases } = await supabase
        .from('aliases')
        .select('alias, canonical')

      const canonicalToAliases: Record<string, string[]> = {}
      for (const row of (aliases ?? []) as Array<{ alias: string; canonical: string }>) {
        if (!canonicalToAliases[row.canonical]) canonicalToAliases[row.canonical] = []
        canonicalToAliases[row.canonical].push(row.alias)
      }

      const values = (tags ?? []).map((t: { value: string }) => ({
        canonical: t.value,
        aliases: canonicalToAliases[t.value] ?? [],
      }))
      return JSON.stringify({ category, values })
    }

    const values = (tags ?? []).map((t: { value: string }) => ({ value: t.value }))
    return JSON.stringify({ category, values })
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` })
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sse(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  // Verify JWT using a Supabase client with the user's token
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser()
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Service-role client for tool execution (bypasses RLS)
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), { status: 503 })
  }

  let body: { messages: Array<{ role: string; content: string }>; model: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { messages, model } = body
  if (!model) {
    return new Response(JSON.stringify({ error: 'model is required' }), { status: 400 })
  }

  // Stream the recommendation back to the client
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: Record<string, unknown>) => {
        try { controller.enqueue(sse(event)) } catch { /* client disconnected */ }
      }

      const fullMessages: Array<Record<string, unknown>> = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ]

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const toolCallBuffers: Map<number, { id: string; type: string; function: { name: string; arguments: string } }> = new Map()
        let accumulatedText = ''
        let finishReason: string | null = null

        try {
          const resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: fullMessages,
              tools: TOOL_SCHEMAS,
              stream: true,
            }),
          })

          if (!resp.ok || !resp.body) {
            const errText = await resp.text().catch(() => resp.statusText)
            enqueue({ type: 'error', message: `OpenRouter returned ${resp.status}: ${errText.slice(0, 200)}` })
            break
          }

          const reader = resp.body.getReader()
          const decoder = new TextDecoder()
          let lineBuffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            lineBuffer += decoder.decode(value, { stream: true })
            const parts = lineBuffer.split('\n\n')
            lineBuffer = parts.pop() ?? ''

            for (const part of parts) {
              for (const line of part.split('\n')) {
                if (!line.startsWith('data: ')) continue
                const raw = line.slice(6).trim()
                if (!raw || raw === '[DONE]') continue

                let payload: Record<string, unknown>
                try { payload = JSON.parse(raw) } catch { continue }

                const choice = ((payload.choices as unknown[]) ?? [{}])[0] as Record<string, unknown>
                const delta = (choice.delta ?? {}) as Record<string, unknown>
                const fr = choice.finish_reason as string | null
                if (fr) finishReason = fr

                // Text content
                const content = delta.content as string | undefined
                if (content) {
                  accumulatedText += content
                  enqueue({ type: 'text_delta', delta: content })
                }

                // Tool call fragments
                for (const tcDelta of ((delta.tool_calls as unknown[]) ?? []) as Array<Record<string, unknown>>) {
                  const idx = (tcDelta.index as number) ?? 0
                  if (!toolCallBuffers.has(idx)) {
                    toolCallBuffers.set(idx, {
                      id: (tcDelta.id as string) ?? '',
                      type: 'function',
                      function: {
                        name: ((tcDelta.function as Record<string, unknown>)?.name as string) ?? '',
                        arguments: '',
                      },
                    })
                  }
                  const buf = toolCallBuffers.get(idx)!
                  if (tcDelta.id) buf.id = tcDelta.id as string
                  const fn = tcDelta.function as Record<string, unknown> | undefined
                  if (fn?.name) buf.function.name = fn.name as string
                  buf.function.arguments += (fn?.arguments as string) ?? ''
                }
              }
            }
          }
        } catch (err) {
          enqueue({ type: 'error', message: `Request failed: ${(err as Error).message}` })
          break
        }

        // --- End of round ---

        if (finishReason === 'tool_calls' && toolCallBuffers.size > 0) {
          const toolCallsList = Array.from(toolCallBuffers.entries())
            .sort(([a], [b]) => a - b)
            .map(([, tc]) => tc)

          for (const tc of toolCallsList) {
            let fnArgs: Record<string, unknown> = {}
            try { fnArgs = JSON.parse(tc.function.arguments || '{}') } catch { /* ignore */ }
            enqueue({ type: 'tool_call', name: tc.function.name, args: fnArgs })
          }

          // Append assistant message with tool_calls
          fullMessages.push({
            role: 'assistant',
            content: accumulatedText || null,
            tool_calls: toolCallsList,
          })

          // Execute tools and append results
          for (const tc of toolCallsList) {
            let fnArgs: Record<string, unknown> = {}
            try { fnArgs = JSON.parse(tc.function.arguments || '{}') } catch { /* ignore */ }
            const result = await executeTool(tc.function.name, fnArgs, supabaseAdmin)
            fullMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result,
            })
          }

          continue // next round
        }

        // finish_reason == 'stop' — extract {"recipe_ids": [...]} from the response.
        // Strip markdown code fences first (LLMs often wrap JSON in ```json ... ```).
        const stripped = accumulatedText.replace(/```[a-z]*\n?/g, '').replace(/```/g, '')
        const match = stripped.match(/\{\s*"recipe_ids"\s*:\s*\[[\s\S]*?\]\s*\}/)
        if (match) {
          try {
            const parsed = JSON.parse(match[0])
            const ids = (parsed.recipe_ids as unknown[]).map(Number).filter(n => !isNaN(n))
            if (ids.length) enqueue({ type: 'recipe_ids', ids })
          } catch { /* ignore */ }
        }

        enqueue({ type: 'done' })
        controller.close()
        return
      }

      enqueue({ type: 'error', message: 'Exceeded maximum tool-call rounds. Please try again.' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
