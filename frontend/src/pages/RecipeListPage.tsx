import { useState } from 'react'
import { Menu, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { FilterSidebar } from '@/components/FilterSidebar'
import { RecipeGrid } from '@/components/RecipeGrid'
import { UserMenu } from '@/components/UserMenu'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useAuth } from '@/auth/useAuth'
import { hasRole } from '@/types/auth'

export function RecipeListPage() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { filters, setFilters, clearFilters, hasActiveFilters } = useUrlFilters()
  const { user, isLoading } = useAuth()
  const canEdit = user ? hasRole(user, 'editor') : false

  const signInButton = !isLoading && !user
    ? (
      <Button size="sm" variant="outline" asChild>
        <Link to="/login">Sign in</Link>
      </Button>
    )
    : null

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between md:hidden">
        <h1 className="font-serif text-xl font-semibold text-primary">Shy Blog Recipes</h1>
        <div className="flex items-center gap-2">
          {user && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/recommend" className="gap-1.5">
                <Sparkles size={14} />
                Ask AI
              </Link>
            </Button>
          )}
          {canEdit && (
            <Button size="sm" asChild>
              <Link to="/recipe/new" className="gap-1.5">
                <Plus size={14} />
                New
              </Link>
            </Button>
          )}
          {signInButton}
          <UserMenu />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Menu size={16} />
                Filters
                {hasActiveFilters && <span className="size-2 rounded-full bg-primary" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 overflow-y-auto">
              <div className="pt-2">
                <FilterSidebar
                  filters={filters}
                  setFilters={setFilters}
                  clearFilters={clearFilters}
                  hasActiveFilters={hasActiveFilters}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 py-6 flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-64 shrink-0">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h1 className="font-serif text-2xl font-semibold text-primary">Shy Blog</h1>
              <p className="text-sm text-muted-foreground">Recipe Collection</p>
            </div>
            {signInButton}
            <UserMenu />
          </div>
          {canEdit && (
            <Button size="sm" className="mt-2 mb-2 w-full gap-1.5" asChild>
              <Link to="/recipe/new">
                <Plus size={14} />
                New Recipe
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className={`mb-4 w-full gap-1.5 ${!canEdit ? 'mt-2' : ''}`}
            asChild
          >
            <Link to={user ? '/recommend' : '/login'}>
              <Sparkles size={14} />
              What should I cook?
            </Link>
          </Button>
          <div className="sticky top-6 max-h-[calc(100vh-5rem)] overflow-y-auto border border-border rounded-lg bg-card">
            <FilterSidebar
              filters={filters}
              setFilters={setFilters}
              clearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </div>
        </aside>

        {/* Main grid */}
        <main className="flex-1 min-w-0">
          <RecipeGrid filters={filters} setFilters={setFilters} />
        </main>
      </div>
    </div>
  )
}
