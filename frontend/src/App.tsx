import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { ExperimentPage } from '@/pages/ExperimentPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Component reference for development only; excluded from production builds.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('@/pages/DesignSystemPage')) : null

export function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
