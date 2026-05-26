import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { RecipeListPage } from './pages/RecipeListPage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { RecipeFormPage } from './pages/RecipeFormPage'
import { RecommendPage } from './pages/RecommendPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RecipeListPage />} />
          <Route path="/recipe/new" element={<RecipeFormPage />} />
          <Route path="/recipe/:id/edit" element={<RecipeFormPage />} />
          <Route path="/recipe/:id" element={<RecipeDetailPage />} />
          <Route path="/recommend" element={<RecommendPage />} />
        </Routes>
        <Toaster richColors position="bottom-right" />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
