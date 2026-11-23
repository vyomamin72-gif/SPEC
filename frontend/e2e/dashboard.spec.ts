import { expect, test } from '@playwright/test'

test.describe('dashboard', () => {
  test('lists every module and reports honest availability', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Physics Laboratory' })).toBeVisible()
    for (const module of [
      'Classical Mechanics',
      'Gravity & Orbital Mechanics',
      'Waves & Oscillations',
      'Electricity & Magnetism',
      'Thermodynamics',
      'Advanced Topics',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: module })).toBeVisible()
    }
    await expect(page.getByTestId('availability-summary')).toHaveText(/^3 of \d+ experiments available\.$/)
    await expect(page.getByText('Available', { exact: true })).toHaveCount(3)
  })

  test('opens a planned experiment page that states its model and status', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /^Solar System/ }).click()
    await expect(page).toHaveURL(/\/lab\/solar-system$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Solar System' })).toBeVisible()
    await expect(page.getByRole('note')).toContainText('not implemented yet')
    await expect(page.getByText(/approximate mean orbital elements/)).toBeVisible()
    await page.getByRole('link', { name: '← All laboratories' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('shows not-found for unknown experiments and routes', async ({ page }) => {
    await page.goto('/lab/perpetual-motion')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await page.goto('/no/such/page')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })

  test('does not ship the development-only design system page', async ({ page }) => {
    await page.goto('/dev/design-system')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })

  test('emits every data-series colour token at runtime', async ({ page }) => {
    // Canvas renderers and charts read these variables directly; Tailwind
    // drops unused theme variables unless the theme is declared static.
    await page.goto('/')
    const missing = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return ['position', 'velocity', 'acceleration', 'force', 'energy', 'momentum', 'theory'].filter(
        (q) => style.getPropertyValue(`--color-q-${q}`).trim() === '',
      )
    })
    expect(missing).toEqual([])
  })

  test('has no horizontal page scroll', async ({ page }) => {
    await page.goto('/')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('storage server indicator', () => {
  test('reports online when the health endpoint answers', async ({ page }) => {
    await page.route('**/api/health', (route) =>
      route.fulfill({ json: { status: 'ok', version: '0.1.0', database: 'ok' } }),
    )
    await page.goto('/')
    await expect(page.getByTestId('backend-status')).toHaveAttribute('data-status', 'online')
  })

  test('reports offline, without breaking the app, when the server is down', async ({ page }) => {
    await page.route('**/api/health', (route) => route.abort('connectionrefused'))
    await page.goto('/')
    await expect(page.getByTestId('backend-status')).toHaveAttribute('data-status', 'offline')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
