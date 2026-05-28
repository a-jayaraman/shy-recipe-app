import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { RecipeListPage } from './pages/RecipeListPage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { RecipeFormPage } from './pages/RecipeFormPage'
import { RecommendPage } from './pages/RecommendPage'
import { LoginPage } from './pages/LoginPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  const basename = import.meta.env.PROD ? '/shy-recipe-app' : '/'

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <Routes>
            {/* OAuth callback — must be before auth provider redirects */}
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Public browse */}
            <Route path="/" element={<RecipeListPage />} />
            <Route path="/recipe/:id" element={<RecipeDetailPage />} />

            {/* Auth required — viewer+ */}
            <Route
              path="/recommend"
              element={
                <RequireAuth>
                  <RecommendPage />
                </RequireAuth>
              }
            />

            {/* Auth required — editor+ */}
            <Route
              path="/recipe/new"
              element={
                <RequireAuth>
                  <RequireRole role="editor">
                    <RecipeFormPage />
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/recipe/:id/edit"
              element={
                <RequireAuth>
                  <RequireRole role="editor">
                    <RecipeFormPage />
                  </RequireRole>
                </RequireAuth>
              }
            />

            {/* Admin only */}
            <Route
              path="/admin/users"
              element={
                <RequireAuth>
                  <RequireRole role="admin">
                    <AdminUsersPage />
                  </RequireRole>
                </RequireAuth>
              }
            />
          </Routes>
          <Toaster richColors position="bottom-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
