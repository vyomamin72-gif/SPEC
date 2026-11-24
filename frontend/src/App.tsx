import { lazy, Suspense } from 'react'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { ExperimentPage } from '@/pages/ExperimentPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Component reference for development only; excluded from production builds.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('@/pages/DesignSystemPage')) : null

// The static build (pnpm build:static) is hosted where path URLs are not
// available, so it keeps navigation in memory instead of in the address bar.
const Router = import.meta.env.VITE_STATIC_DEMO === 'true' ? MemoryRouter : BrowserRouter

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="lab/:experimentId" element={<ExperimentPage />} />
          {DesignSystemPage && (
            <Route
              path="dev/design-system"
              element={
                <Suspense fallback={null}>
                  <DesignSystemPage />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Router>
  )
}
