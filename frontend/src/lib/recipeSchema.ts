import { z } from 'zod'
import { COURSE_OPTIONS, DIFFICULTY_OPTIONS, TOTAL_TIME_OPTIONS } from './utils'

export const UNIT_OPTIONS = [
  '', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'pinch', 'cloves', 'package',
] as const

const COURSE_VALUES = COURSE_OPTIONS.map(o => o.value) as [string, ...string[]]
const DIFFICULTY_VALUES = DIFFICULTY_OPTIONS.map(o => o.value) as [string, ...string[]]
const TOTAL_TIME_VALUES = TOTAL_TIME_OPTIONS.map(o => o.value) as [string, ...string[]]

const ingredientSchema = z.object({
  amount: z.string(),
  unit: z.string(),
  name: z.string().min(1, 'Ingredient name is required'),
  notes: z.string(),
})

const instructionSchema = z.object({
  text: z.string().min(1, 'Step cannot be empty'),
})

export const recipeFormSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  author: z.string(),
  servings: z.string(),
  course: z.string().refine(v => v === '' || COURSE_VALUES.includes(v), {
    message: 'Invalid course value',
  }),
  difficulty: z.string().refine(v => v === '' || DIFFICULTY_VALUES.includes(v), {
    message: 'Invalid difficulty value',
  }),
  total_time: z.string().refine(v => v === '' || [...TOTAL_TIME_VALUES, 'unknown'].includes(v), {
    message: 'Invalid total_time value',
  }),
  prep_time: z.string(),
  cook_time: z.string(),
  ingredients: z
    .array(ingredientSchema)
    .min(1, 'At least one ingredient is required')
    .refine(
      items => items.some(i => i.name.trim().length > 0),
      { message: 'At least one ingredient must have a name' }
    ),
  instructions: z
    .array(instructionSchema)
    .min(1, 'At least one instruction step is required')
    .refine(
      items => items.some(i => i.text.trim().length > 0),
      { message: 'At least one instruction step must have text' }
    ),
  cuisine: z.array(z.string()).min(1, 'At least one cuisine is required'),
  cooking_method: z.array(z.string()),
  serve_with: z.array(z.string()),
  dietary: z.array(z.string()),
  key_ingredients: z.array(z.string()),
  notes: z.string(),
})

export type RecipeFormValues = z.infer<typeof recipeFormSchema>

export function emptyIngredient() {
  return { amount: '', unit: '', name: '', notes: '' }
}
