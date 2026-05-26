import { apiClient } from './client'
import type { AllTagsResponse } from '../types/recipe'

export async function fetchAllTags(): Promise<AllTagsResponse> {
  const { data } = await apiClient.get<AllTagsResponse>('/tags')
  return data
}

export async function fetchTagAliases(): Promise<Record<string, string>> {
  const { data } = await apiClient.get<Record<string, string>>('/aliases/tags')
  return data
}

export async function fetchIngredientAliases(): Promise<Record<string, string>> {
  const { data } = await apiClient.get<Record<string, string>>('/aliases/ingredients')
  return data
}
