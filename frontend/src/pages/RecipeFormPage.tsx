import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/FilterSection'
import { TagMultiCombobox } from '@/components/form/TagMultiCombobox'
import { SortableIngredientRow } from '@/components/form/SortableIngredientRow'
import { SortableInstructionRow } from '@/components/form/SortableInstructionRow'
import { LlmAssistModal } from '@/components/LlmAssistModal'
import { useRecipeDetail, useCreateRecipe, useUpdateRecipe, useDeleteRecipe } from '@/hooks/useRecipes'
import { recipeFormSchema, emptyIngredient, type RecipeFormValues } from '@/lib/recipeSchema'
import { COURSE_OPTIONS, DIFFICULTY_OPTIONS, TOTAL_TIME_OPTIONS } from '@/lib/utils'
import { toast } from 'sonner'
import { Sparkles, Plus, Loader2, Trash2, ArrowLeft, AlertCircle } from 'lucide-react'
import type { RecipeDetail, ParseRecipeResponse, RecipeWritePayload } from '@/types/recipe'
import { cn } from '@/lib/utils'

const DEFAULT_AUTHOR = import.meta.env.VITE_DEFAULT_AUTHOR ?? ''

const TAG_CATEGORIES = [
  { key: 'cuisine' as const, label: 'Cuisine' },
  { key: 'cooking_method' as const, label: 'Cooking Method' },
  { key: 'serve_with' as const, label: 'Serve With' },
  { key: 'dietary' as const, label: 'Dietary' },
  { key: 'key_ingredients' as const, label: 'Key Ingredients' },
] as const

function mapDetailToFormValues(recipe: RecipeDetail): RecipeFormValues {
  return {
    title: recipe.title_clean || recipe.title,
    author: recipe.author ?? '',
    servings: recipe.servings ?? '',
    course: recipe.course ?? '',
    difficulty: recipe.difficulty ?? '',
    total_time: recipe.total_time ?? '',
    prep_time: recipe.times?.prep_time ?? '',
    cook_time: recipe.times?.cook_time ?? '',
    ingredients: recipe.ingredients.length > 0
      ? recipe.ingredients.map(ing => ({
          amount: ing.amount ?? '',
          unit: ing.unit ?? '',
          name: ing.name,
          notes: ing.notes ?? '',
        }))
      : [emptyIngredient()],
    instructions: recipe.instructions.length > 0
      ? recipe.instructions.map(text => ({ text }))
      : [{ text: '' }],
    cuisine: recipe.cuisine,
    cooking_method: recipe.cooking_method,
    serve_with: recipe.serve_with,
    dietary: recipe.dietary,
    key_ingredients: recipe.key_ingredients,
    notes: recipe.notes ?? '',
  }
}

function mapFormValuesToPayload(values: RecipeFormValues): RecipeWritePayload {
  const times: Record<string, string> = {}
  if (values.prep_time?.trim()) times.prep_time = values.prep_time.trim()
  if (values.cook_time?.trim()) times.cook_time = values.cook_time.trim()

  return {
    title: values.title,
    title_clean: values.title,
    author: values.author || null,
    servings: values.servings || null,
    times,
    course: values.course || null,
    difficulty: values.difficulty || null,
    total_time: values.total_time || null,
    notes: values.notes || null,
    ingredients: values.ingredients.map(ing => ({
      amount: ing.amount || null,
      unit: ing.unit || null,
      name: ing.name,
      notes: ing.notes || null,
    })),
    instructions: values.instructions.map(i => i.text),
    cuisine: values.cuisine,
    cooking_method: values.cooking_method,
    serve_with: values.serve_with,
    dietary: values.dietary,
    key_ingredients: values.key_ingredients,
  }
}

export function RecipeFormPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = id != null
  const recipeId = id ? Number(id) : undefined

  const [llmOpen, setLlmOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const { data: recipe, isLoading: recipeLoading } = useRecipeDetail(recipeId)
  const createMutation = useCreateRecipe()
  const updateMutation = useUpdateRecipe(recipeId)
  const deleteMutation = useDeleteRecipe()

  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: {
      title: '',
      author: DEFAULT_AUTHOR,
      servings: '',
      course: '',
      difficulty: '',
      total_time: '',
      prep_time: '',
      cook_time: '',
      ingredients: [emptyIngredient()],
      instructions: [{ text: '' }],
      cuisine: [],
      cooking_method: [],
      serve_with: [],
      dietary: [],
      key_ingredients: [],
      notes: '',
    },
  })

  const { register, control, handleSubmit, formState: { errors, isDirty, isSubmitSuccessful, isSubmitting }, reset, setValue } = form

  // Pre-fill form when editing
  useEffect(() => {
    if (recipe) reset(mapDetailToFormValues(recipe))
  }, [recipe, reset])

  const {
    fields: ingredientFields,
    append: appendIngredient,
    remove: removeIngredient,
    move: moveIngredient,
  } = useFieldArray({ control, name: 'ingredients' })

  const {
    fields: instructionFields,
    append: appendInstruction,
    remove: removeInstruction,
    move: moveInstruction,
  } = useFieldArray({ control, name: 'instructions' })

  // DnD sensors
  const ingredientSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const instructionSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleIngredientDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIdx = ingredientFields.findIndex(f => f.id === active.id)
      const newIdx = ingredientFields.findIndex(f => f.id === over.id)
      if (oldIdx !== -1 && newIdx !== -1) moveIngredient(oldIdx, newIdx)
    }
  }

  function handleInstructionDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIdx = instructionFields.findIndex(f => f.id === active.id)
      const newIdx = instructionFields.findIndex(f => f.id === over.id)
      if (oldIdx !== -1 && newIdx !== -1) moveInstruction(oldIdx, newIdx)
    }
  }

  // LLM assist pre-fill
  const handleParseResult = (result: ParseRecipeResponse) => {
    setValue('title', result.title, { shouldDirty: true })
    setValue('servings', result.servings ?? '', { shouldDirty: true })
    setValue('course', result.course ?? '', { shouldDirty: true })
    setValue('difficulty', result.difficulty ?? '', { shouldDirty: true })
    setValue('total_time', result.total_time ?? '', { shouldDirty: true })
    setValue('ingredients', result.ingredients.map(i => ({
      amount: i.amount ?? '',
      unit: i.unit ?? '',
      name: i.name,
      notes: i.notes ?? '',
    })), { shouldDirty: true })
    setValue('instructions', result.instructions.map(text => ({ text })), { shouldDirty: true })
    setValue('cuisine', result.cuisine, { shouldDirty: true })
    setValue('cooking_method', result.cooking_method, { shouldDirty: true })
    setValue('serve_with', result.serve_with, { shouldDirty: true })
    setValue('dietary', result.dietary, { shouldDirty: true })
    setValue('key_ingredients', result.key_ingredients, { shouldDirty: true })
    setValue('notes', result.notes ?? '', { shouldDirty: true })
  }

  // Submit
  const onSubmit = async (values: RecipeFormValues) => {
    const payload = mapFormValuesToPayload(values)
    try {
      const result = isEdit
        ? await updateMutation.mutateAsync(payload)
        : await createMutation.mutateAsync(payload)
      result.warnings.forEach(w => toast.warning(w))
      toast.success(isEdit ? 'Recipe updated' : 'Recipe created')
      navigate(`/recipe/${result.id}`)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error(detail ? String(detail) : 'Failed to save recipe')
    }
  }

  // Delete
  const handleDelete = () => {
    if (!recipeId) return
    deleteMutation.mutate(recipeId, {
      onSuccess: () => {
        toast.success('Recipe deleted')
        navigate('/')
      },
      onError: () => toast.error('Failed to delete recipe'),
    })
  }

  // Cancel with dirty check
  const handleCancel = () => {
    if (isDirty) {
      setCancelOpen(true)
    } else {
      navigate(isEdit ? `/recipe/${recipeId}` : '/')
    }
  }

  // Warn on browser refresh/close when there are unsaved changes
  useEffect(() => {
    if (!isDirty || isSubmitSuccessful) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, isSubmitSuccessful])

  // Validation error summary
  const hasErrors = Object.keys(errors).length > 0
  const isMutating = isSubmitting || createMutation.isPending || updateMutation.isPending

  if (isEdit && recipeLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-8 bg-muted rounded w-2/3" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <button
          onClick={handleCancel}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          {isEdit ? 'Back to recipe' : 'Back to recipes'}
        </button>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="font-serif text-2xl font-semibold">
                {isEdit ? 'Edit Recipe' : 'New Recipe'}
              </h1>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setLlmOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <Sparkles size={14} />
                  Paste recipe text — let Claude fill it in
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button type="submit" disabled={isMutating}>
                {isMutating ? <><Loader2 size={14} className="animate-spin mr-2" />Saving…</> : 'Save'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>

          {/* Validation error banner */}
          {hasErrors && form.formState.isSubmitted && (
            <div className="mb-6 flex gap-2 items-start rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium mb-1">Please fix the following before saving:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {errors.title && <li>{errors.title.message}</li>}
                  {errors.cuisine && <li>Cuisine: {errors.cuisine.message ?? 'required'}</li>}
                  {errors.course && <li>Course: {errors.course.message}</li>}
                  {errors.difficulty && <li>Difficulty: {errors.difficulty.message}</li>}
                  {errors.total_time && <li>Total time: {errors.total_time.message}</li>}
                  {errors.ingredients && <li>Ingredients: {typeof errors.ingredients?.message === 'string' ? errors.ingredients.message : 'check ingredient fields'}</li>}
                  {errors.instructions && <li>Instructions: {typeof errors.instructions?.message === 'string' ? errors.instructions.message : 'check instruction steps'}</li>}
                </ul>
              </div>
            </div>
          )}

          {/* ── Section: Basics ── */}
          <FormSection title="Basics">
            <div className="space-y-4">
              <FormField label="Title" error={errors.title?.message} required>
                <Input {...register('title')} placeholder="Recipe title" className={cn(errors.title && 'border-destructive')} />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Author">
                  <Input {...register('author')} placeholder="Author name" />
                </FormField>
                <FormField label="Servings">
                  <Input {...register('servings')} placeholder='e.g. "4" or "6–8"' />
                </FormField>
              </div>

              <FormField label="Course" required error={errors.course?.message}>
                <Controller
                  control={control}
                  name="course"
                  render={({ field }) => (
                    <SegmentedControl
                      options={COURSE_OPTIONS}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </FormField>

              <FormField label="Difficulty" error={errors.difficulty?.message}>
                <Controller
                  control={control}
                  name="difficulty"
                  render={({ field }) => (
                    <SegmentedControl
                      options={DIFFICULTY_OPTIONS}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </FormField>

              <FormField label="Total Time" error={errors.total_time?.message}>
                <Controller
                  control={control}
                  name="total_time"
                  render={({ field }) => (
                    <SegmentedControl
                      options={[...TOTAL_TIME_OPTIONS, { value: 'unknown', label: 'Unknown' }]}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Prep Time">
                  <Input {...register('prep_time')} placeholder='e.g. "15 minutes"' />
                </FormField>
                <FormField label="Cook Time">
                  <Input {...register('cook_time')} placeholder='e.g. "30 minutes"' />
                </FormField>
              </div>
            </div>
          </FormSection>

          {/* ── Section: Ingredients ── */}
          <FormSection title="Ingredients">
            {errors.ingredients?.message && (
              <p className="text-sm text-destructive mb-3">{errors.ingredients.message}</p>
            )}
            <DndContext sensors={ingredientSensors} onDragEnd={handleIngredientDragEnd}>
              <SortableContext items={ingredientFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {ingredientFields.map((field, index) => (
                    <SortableIngredientRow
                      key={field.id}
                      id={field.id}
                      index={index}
                      control={control}
                      register={register}
                      errors={errors}
                      onRemove={() => removeIngredient(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 gap-1"
              onClick={() => appendIngredient(emptyIngredient())}
            >
              <Plus size={14} />
              Add ingredient
            </Button>
          </FormSection>

          {/* ── Section: Instructions ── */}
          <FormSection title="Instructions">
            {errors.instructions?.message && (
              <p className="text-sm text-destructive mb-3">{errors.instructions.message}</p>
            )}
            <DndContext sensors={instructionSensors} onDragEnd={handleInstructionDragEnd}>
              <SortableContext items={instructionFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {instructionFields.map((field, index) => (
                    <SortableInstructionRow
                      key={field.id}
                      id={field.id}
                      index={index}
                      register={register}
                      errors={errors}
                      onRemove={() => removeInstruction(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 gap-1"
              onClick={() => appendInstruction({ text: '' })}
            >
              <Plus size={14} />
              Add step
            </Button>
          </FormSection>

          {/* ── Section: Tags ── */}
          <FormSection title="Tags">
            <div className="space-y-4">
              {TAG_CATEGORIES.map(({ key, label }) => (
                <FormField
                  key={key}
                  label={label}
                  required={key === 'cuisine'}
                  error={(errors as any)[key]?.message}
                >
                  <Controller
                    control={control}
                    name={key}
                    render={({ field }) => (
                      <TagMultiCombobox
                        category={key === 'key_ingredients' ? 'key_ingredient' : key}
                        selected={field.value}
                        onChange={field.onChange}
                        allowNew
                      />
                    )}
                  />
                </FormField>
              ))}
            </div>
          </FormSection>

          {/* ── Section: Notes ── */}
          <FormSection title="Notes">
            <Textarea
              {...register('notes')}
              placeholder="Any notes, tips, or variations…"
              rows={4}
              className="resize-none"
            />
          </FormSection>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-2">
              <Button type="submit" disabled={isMutating}>
                {isMutating ? <><Loader2 size={14} className="animate-spin mr-2" />Saving…</> : 'Save'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                className="gap-1.5"
              >
                <Trash2 size={14} />
                Delete Recipe
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* LLM assist modal */}
      <LlmAssistModal
        open={llmOpen}
        onOpenChange={setLlmOpen}
        onResult={handleParseResult}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recipe?</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{recipe?.title_clean ?? recipe?.title}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <><Loader2 size={14} className="animate-spin mr-2" />Deleting…</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel with unsaved changes dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to leave?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => navigate(isEdit ? `/recipe/${recipeId}` : '/')}
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-serif text-lg font-semibold mb-4 pb-2 border-b border-border">
        {title}
      </h2>
      {children}
    </section>
  )
}

function FormField({
  label,
  error,
  required,
  children,
}: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
