export interface Ingredient {
  order_idx: number
  amount: string | null
  unit: string | null
  name: string
  notes: string | null
}

export interface RecipeListItem {
  id: number
  title_clean: string
  course: string | null
  cuisine: string[]
  cooking_method: string[]
  serve_with: string[]
  dietary: string[]
  key_ingredients: string[]
  difficulty: string | null
  total_time: string | null
  url_slug: string | null
}

export interface RecipeDetail extends RecipeListItem {
  blog_id: string | null
  title: string
  title_inferred: boolean
  author: string | null
  published: string | null
  updated: string | null
  servings: string | null
  times: Record<string, string>
  notes: string | null
  has_structured_data: boolean
  existing_tags: string[]
  ingredients: Ingredient[]
  instructions: string[]
}

export interface RecipeListResponse {
  total: number
  limit: number
  offset: number
  items: RecipeListItem[]
}

export interface TagValue {
  value: string
  display_name: string
  count: number
}

export interface AllTagsResponse {
  categories: {
    cuisine: TagValue[]
    cooking_method: TagValue[]
    serve_with: TagValue[]
    dietary: TagValue[]
    key_ingredient: TagValue[]
  }
}

export interface IngredientIn {
  amount?: string | null
  unit?: string | null
  name: string
  notes?: string | null
}

export interface RecipeWritePayload {
  title: string
  title_clean: string
  author?: string | null
  servings?: string | null
  times: Record<string, string>
  course?: string | null
  difficulty?: string | null
  total_time?: string | null
  notes?: string | null
  ingredients: IngredientIn[]
  instructions: string[]
  cuisine: string[]
  cooking_method: string[]
  serve_with: string[]
  dietary: string[]
  key_ingredients: string[]
}

export interface RecipeWriteResponse extends RecipeDetail {
  warnings: string[]
}

export interface ParseRecipeResponse {
  title: string
  servings?: string | null
  notes?: string | null
  course?: string | null
  difficulty?: string | null
  total_time?: string | null
  ingredients: IngredientIn[]
  instructions: string[]
  cuisine: string[]
  cooking_method: string[]
  serve_with: string[]
  dietary: string[]
  key_ingredients: string[]
}

export interface RecipeFilters {
  q: string
  cuisine: string[]
  course: string
  cooking_method: string[]
  serve_with: string[]
  dietary: string[]
  key_ingredient: string[]
  difficulty: string
  total_time: string
  sort: string
}
