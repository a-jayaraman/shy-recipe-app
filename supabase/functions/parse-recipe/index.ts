// Supabase Edge Function: parse-recipe
// Parses raw recipe text into structured data using OpenRouter.
// Requires editor or admin role.

import { createClient } from 'npm:@supabase/supabase-js@2'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = '~anthropic/claude-sonnet-latest'

const SHARED_SCHEMA = `
{
  "title_clean": string,

  "ingredients": [
    {
      "amount": string,   // e.g. "1", "1/2", "2-3" — empty string if unspecified
      "unit":   string,   // e.g. "tsp", "cup", "cloves" — empty string if none
      "name":   string,   // the ingredient name, clean and lowercase
      "notes":  string    // prep notes e.g. "diced", "optional" — empty string if none
    }
  ],

  "instructions": [string],   // ordered list of instruction steps, one step per string,
                               // clean prose (no HTML, no step numbers)

  "tags": {
    "title_clean": string,
    "cuisine": [string],
    "course": string,
    "cooking_method": [string],
    "difficulty": string,
    "total_time": string,
    "serve_with": [string],
    "dietary": [string],
    "key_ingredients": [string],
    "notes": string
  }
}`

const SYSTEM_UNSTRUCTURED = `You are a recipe parser and metadata tagger. Given a recipe title and
its raw text, extract clean structured data and return a JSON object with exactly the schema
below. Do not include any explanation, markdown, or extra text — only the raw JSON object.

Schema:
${SHARED_SCHEMA}

Rules:
- All recipes are vegetarian. Do NOT add "vegan" unless there is genuinely no dairy or eggs.
- For Indian recipes, distinguish South Indian vs North Indian when you can tell.
- "spice-mix" course is for recipes that produce a powder or blended spice mix to store.
- "condiment" covers chutneys, sauces, dressings, pickles, pastes.
- instant-pot and pressure-cooker are different methods — use instant-pot only if the recipe
  explicitly mentions an Instant Pot by name.
- Be generous with key_ingredients — include things people would plausibly filter by.
- If the raw text is ambiguous or incomplete, do your best and set tags.notes accordingly.
- Ingredient amounts and units should be strings, not numbers ("1/2" not 0.5).
- Instructions should be clean prose steps — strip any HTML artifacts, merge continuation
  sentences that belong to the same step, split steps that contain multiple distinct actions.
`

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

  // Verify JWT and check editor/admin role
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser()
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Check role via profiles table using service role (bypasses RLS)
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !['editor', 'admin'].includes(profile.role) || !profile.is_active) {
    return new Response(JSON.stringify({ error: 'Forbidden: editor or admin role required' }), { status: 403 })
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), { status: 503 })
  }

  let body: { text: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  if (!body.text || body.text.length > 20_000) {
    return new Response(JSON.stringify({ error: 'text is required and must be under 20,000 characters' }), { status: 400 })
  }

  const model = Deno.env.get('OPENROUTER_MODEL') ?? DEFAULT_MODEL
  const userMsg = `Title: (unknown)\n\nRaw content:\n${body.text}`

  let resp: Response
  try {
    resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        messages: [
          { role: 'system', content: SYSTEM_UNSTRUCTURED },
          { role: 'user', content: userMsg },
        ],
      }),
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `OpenRouter request failed: ${(err as Error).message}` }),
      { status: 502 },
    )
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText)
    return new Response(
      JSON.stringify({ error: `OpenRouter returned ${resp.status}: ${errText.slice(0, 300)}` }),
      { status: 502 },
    )
  }

  const result = await resp.json()
  let raw: string = (result.choices?.[0]?.message?.content ?? '').trim()

  // Strip markdown fences if model wraps output
  if (raw.startsWith('```')) {
    raw = raw.split('```')[1]
    if (raw.startsWith('json')) raw = raw.slice(4)
    raw = raw.trim()
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw)
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `Could not parse LLM response as JSON: ${(e as Error).message}` }),
      { status: 422 },
    )
  }

  const tags = (data.tags ?? {}) as Record<string, unknown>

  // Resolve ingredient aliases server-side
  const rawIngredients = (data.ingredients ?? []) as Array<Record<string, string>>
  const resolvedIngredients: Array<Record<string, string | null>> = []
  for (const ing of rawIngredients) {
    const name = ing.name ?? ''
    let canonical = name
    if (name) {
      const { data: aliasData } = await supabaseAdmin
        .from('aliases')
        .select('canonical')
        .eq('alias', name.toLowerCase())
        .maybeSingle()
      if (aliasData?.canonical) canonical = aliasData.canonical
    }
    resolvedIngredients.push({
      amount: ing.amount || null,
      unit: ing.unit || null,
      name: canonical,
      notes: ing.notes || null,
    })
  }

  const response = {
    title: data.title_clean ?? '',
    servings: null,
    notes: (tags.notes as string) || null,
    course: (tags.course as string) || null,
    difficulty: (tags.difficulty as string) || null,
    total_time: (tags.total_time as string) || null,
    ingredients: resolvedIngredients,
    instructions: (data.instructions ?? []) as string[],
    cuisine: (tags.cuisine ?? []) as string[],
    cooking_method: (tags.cooking_method ?? []) as string[],
    serve_with: (tags.serve_with ?? []) as string[],
    dietary: (tags.dietary ?? []) as string[],
    key_ingredients: (tags.key_ingredients ?? []) as string[],
  }

  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
