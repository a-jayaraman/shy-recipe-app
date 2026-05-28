import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchRecipes, fetchRecipeById, createRecipe, updateRecipe, deleteRecipe, parseRecipeText } from '@/queries/recipes'
import type { RecipeFilters, RecipeWritePayload } from '../types/recipe'

export function useRecipes(filters: RecipeFilters, limit = 100, offset = 0, shuffleNonce = 0) {
  return useQuery({
    queryKey: ['recipes', filters, limit, offset, shuffleNonce],
    queryFn: () => fetchRecipes({ ...filters, limit, offset }),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
}

export function useRecipeDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['recipe', id],
    queryFn: () => fetchRecipeById(id!),
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RecipeWritePayload) => createRecipe(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useUpdateRecipe(id: number | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RecipeWritePayload) => updateRecipe(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipe', id] })
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteRecipe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useParseRecipe() {
  return useMutation({
    mutationFn: (text: string) => parseRecipeText(text),
  })
}
