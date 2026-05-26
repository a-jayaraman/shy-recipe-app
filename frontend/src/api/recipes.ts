import { apiClient } from './client'
import type {
  RecipeListResponse,
  RecipeDetail,
  RecipeFilters,
  RecipeWritePayload,
  RecipeWriteResponse,
  ParseRecipeResponse,
} from '../types/recipe'

export async function fetchRecipes(
  filters: Partial<RecipeFilters> & { limit?: number; offset?: number }
): Promise<RecipeListResponse> {
  const params = new URLSearchParams()

  if (filters.q) params.set('q', filters.q)
  if (filters.course) params.set('course', filters.course)
  if (filters.difficulty) params.set('difficulty', filters.difficulty)
  if (filters.total_time) params.set('total_time', filters.total_time)
  if (filters.sort) params.set('sort', filters.sort)
  if (filters.limit != null) params.set('limit', String(filters.limit))
  if (filters.offset != null) params.set('offset', String(filters.offset))

  filters.cuisine?.forEach(v => params.append('cuisine', v))
  filters.cooking_method?.forEach(v => params.append('cooking_method', v))
  filters.serve_with?.forEach(v => params.append('serve_with', v))
  filters.dietary?.forEach(v => params.append('dietary', v))
  filters.key_ingredient?.forEach(v => params.append('key_ingredient', v))

  const { data } = await apiClient.get<RecipeListResponse>('/recipes', { params })
  return data
}

export async function fetchRecipeById(id: number): Promise<RecipeDetail> {
  const { data } = await apiClient.get<RecipeDetail>(`/recipes/${id}`)
  return data
}

export async function createRecipe(payload: RecipeWritePayload): Promise<RecipeWriteResponse> {
  const { data } = await apiClient.post<RecipeWriteResponse>('/recipes', payload)
  return data
}

export async function updateRecipe(id: number, payload: RecipeWritePayload): Promise<RecipeWriteResponse> {
  const { data } = await apiClient.put<RecipeWriteResponse>(`/recipes/${id}`, payload)
  return data
}

export async function deleteRecipe(id: number): Promise<void> {
  await apiClient.delete(`/recipes/${id}`)
}

export async function parseRecipeText(text: string): Promise<ParseRecipeResponse> {
  const { data } = await apiClient.post<ParseRecipeResponse>('/parse-recipe', { text })
  return data
}
