import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function recipeGradient(id: number): string {
  const hue = Math.round((id * 137.508) % 360)
  const hue2 = (hue + 40) % 360
  return `linear-gradient(135deg, hsl(${hue}, 55%, 72%), hsl(${hue2}, 45%, 62%))`
}

export const TOTAL_TIME_LABELS: Record<string, string> = {
  'under-30-min': 'Under 30 min',
  '30-60-min': '30–60 min',
  '1-2-hrs': '1–2 hrs',
  'over-2-hrs': 'Over 2 hrs',
  'unknown': 'Unknown',
}

export const COURSE_OPTIONS = [
  { value: 'main', label: 'Main' },
  { value: 'side', label: 'Side' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'soup', label: 'Soup' },
  { value: 'salad', label: 'Salad' },
  { value: 'condiment', label: 'Condiment' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'snack', label: 'Snack' },
  { value: 'spice-mix', label: 'Spice Mix' },
  { value: 'drink', label: 'Drink' },
]

export const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

export const TOTAL_TIME_OPTIONS = [
  { value: 'under-30-min', label: 'Under 30m' },
  { value: '30-60-min', label: '30–60m' },
  { value: '1-2-hrs', label: '1–2 hrs' },
  { value: 'over-2-hrs', label: '2+ hrs' },
]

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

export const COURSE_LABELS: Record<string, string> = {
  main: 'Main',
  side: 'Side',
  breakfast: 'Breakfast',
  soup: 'Soup',
  salad: 'Salad',
  condiment: 'Condiment',
  dessert: 'Dessert',
  snack: 'Snack',
  'spice-mix': 'Spice Mix',
  drink: 'Drink',
}
