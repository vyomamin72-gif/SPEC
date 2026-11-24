import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { EXPERIMENTS } from '../src/catalog/experiments'

const readout = (page: Page, label: string) => page.getByTestId(`readout-${label}`).locator('dd')

test.describe('projectile motion', () => {
  test('runs to landing and the measured range equals the closed form', async ({ page }) => {
    await page.goto('/lab/projectile-motion')
    await expect(page.getByRole('img', { name: /projectile/ })).toBeVisible()
    await expect(readout(page, 'Range (simulated)')).toHaveText('—')
    await page.getByLabel('Simulation speed').selectOption('8')
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByText('Run complete')).toBeVisible({ timeout: 10_000 })
    // v₀ = 20 m/s, θ = 45°, g = 9.80665 m/s²: R = v₀²/g = 40.79 m, T = 2.884 s, H = 10.20 m
    await expect(readout(page, 'Range (simulated)')).toHaveText('40.79 m')
    await expect(readout(page, 'Range (theory)')).toHaveText('40.79 m')
    await expect(readout(page, 'Flight time (simulated)')).toHaveText('2.884 s')
    await expect(readout(page, 'Max height (simulated)')).toHaveText('10.20 m')
    await expect(page.getByTestId('sim-time')).toHaveText('2.884')
  })

  test('changing a parameter resets the run and updates theory', async ({ page }) => {
    await page.goto('/lab/projectile-motion')
    await page.getByRole('button', { name: 'Step' }).click()
    await expect(page.getByTestId('sim-time')).toHaveText('0.001000')
    const angle = page.getByLabel('Launch angle θ', { exact: true })
    await angle.fill('30')
    await angle.press('Enter')
    await expect(page.getByTestId('sim-time')).toHaveText('0.000')
    await expect(readout(page, 'Range (theory)')).toHaveText('35.32 m') // v₀² sin 60° / g
  })

  test('drag settings appear only when drag is enabled', async ({ page }) => {
    await page.goto('/lab/projectile-motion')
    await expect(page.getByLabel('Drag coefficient C_d', { exact: true })).toHaveCount(0)
    await page.getByLabel('Air resistance (quadratic drag)').check()
    await expect(page.getByLabel('Drag coefficient C_d', { exact: true })).toBeVisible()
    await expect(page.getByRole('note').first()).toContainText('no closed-form solution')
  })
})

test.describe('pendulum', () => {
  test('single-steps, and keyboard shortcuts control the run', async ({ page }) => {
    await page.goto('/lab/pendulum')
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step' }).click()
    await expect(page.getByTestId('sim-time')).toHaveText('0.003000')
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
    await page.keyboard.press('r')
    await expect(page.getByTestId('sim-time')).toHaveText('0.000')
  })

  test('measures a period that matches the exact theory', async ({ page }) => {
    await page.goto('/lab/pendulum')
    await page.getByLabel('Simulation speed').selectOption('8')
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(readout(page, 'Periods completed')).not.toHaveText('0', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    // L = 1 m, θ₀ = 30°: T = 4√(L/g)·K(sin 15°) = 2.041 s
    await expect(readout(page, 'Period (measured)')).toHaveText('2.041 s')
    await expect(readout(page, 'Period (exact theory)')).toHaveText('2.041 s')
  })
})

test.describe("Newton's laws", () => {
  test('the block slides with kinetic friction, and the force can change mid-run', async ({ page }) => {
    await page.goto('/lab/newtons-laws')
    await expect(readout(page, 'Acceleration a')).toHaveText('2.058\u00a0m/s²') // (50 − 0.3·10·g)/10
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(readout(page, 'Friction regime')).toHaveText('kinetic')
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const timeBefore = await page.getByTestId('sim-time').textContent()
    // Pausing first makes the check deterministic: the block is still sliding.
    const force = page.getByLabel('Applied force F', { exact: true })
    await force.fill('0')
    await force.press('Enter')
    await expect(page.getByTestId('sim-time')).toHaveText(timeBefore ?? '') // live parameter: not reset
    await expect(readout(page, 'Acceleration a')).toHaveText('\u22122.942\u00a0m/s²') // −μk·g
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(readout(page, 'Friction regime')).toHaveText('none', { timeout: 10_000 }) // at rest, no force
    await expect(readout(page, 'Measured stopping point')).not.toHaveText('—')
  })
})

test.describe('graphs and data', () => {
  test('charts recorded data; recording pauses, clears and exports to CSV', async ({ page }) => {
    await page.goto('/lab/pendulum')
    await expect(page.getByTestId('chart-angle').locator('canvas').first()).toBeVisible()
    await page.getByLabel('Simulation speed').selectOption('4')
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('sample-count')).not.toHaveText('1 samples')

    await page.getByRole('button', { name: 'Pause recording' }).click()
    const frozen = (await page.getByTestId('sample-count').textContent()) ?? ''
    await page.waitForTimeout(400) // simulation keeps running, recording does not
    await expect(page.getByTestId('sample-count')).toHaveText(frozen)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()

    await page.getByRole('button', { name: 'Energy' }).click()
    await expect(page.getByTestId('chart-energy').locator('canvas').first()).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^pendulum-.+\.csv$/)
    const lines = (await readFile(await download.path(), 'utf8')).trim().split('\n')
    expect(lines[0]).toMatch(/^t \(s\),θ \(°\),/)
    expect(lines).toHaveLength(Number.parseInt(frozen, 10) + 1) // header + every recorded sample
    // First sample: released at θ₀ = 30°. Stored in radians, so 30° → rad → ° carries
    // one unit of round-off; the CSV exports the exact double rather than hiding it.
    expect(lines[1].split(',').map(Number)[1]).toBeCloseTo(30, 12)

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByTestId('sample-count')).toHaveText('0 samples')
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })
})

test.describe('every available laboratory', () => {
  for (const experiment of EXPERIMENTS.filter((e) => e.availability.status === 'available')) {
    test(`${experiment.id} opens, runs and reports measurements without errors`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      // No backend runs during e2e; stub its health check so only real app errors remain.
      await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ok', version: 'test', database: 'ok' } }))
      await page.goto(`/lab/${experiment.id}`)
      await expect(page.getByRole('heading', { level: 1, name: experiment.title })).toBeVisible()
      await expect(page.locator('[data-testid^="readout-"]').first()).toBeVisible()
      const play = page.getByRole('button', { name: 'Play' })
      if (await play.isEnabled()) {
        await play.click()
        await page.waitForTimeout(600)
        await expect(page.getByTestId('sim-time')).not.toHaveText('0.000')
      } else {
        // Static configuration (a field map, a resistor network): it must say so.
        await expect(page.getByText('Static: nothing changes over time')).toBeVisible()
      }
      expect(errors).toEqual([])
    })
  }
})

test.describe('collisions', () => {
  test('conserves total momentum through the collision', async ({ page }) => {
    await page.goto('/lab/collisions')
    await page.getByLabel('Simulation speed').selectOption('4')
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByText('Run complete')).toBeVisible({ timeout: 15_000 })
    // m₁ = 1 kg at 2 m/s, m₂ = 3 kg at −1 m/s: p = −1 kg·m/s; elastic → v₁′ = −2.5, v₂′ = 0.5 m/s
    await expect(readout(page, 'Total momentum (now)')).toHaveText('\u22121.000\u00a0kg·m/s')
    await expect(readout(page, 'Left body after (simulated)')).toHaveText('\u22122.500\u00a0m/s')
    await expect(readout(page, 'Right body after (theory)')).toHaveText('0.5000\u00a0m/s')
  })
})

test.describe('circular motion', () => {
  test('tension is mω²r and cutting the tether removes it', async ({ page }) => {
    await page.goto('/lab/circular-motion')
    await expect(readout(page, 'Tension T = mω²r')).toHaveText('4.000\u00a0N') // 0.5 · 2² · 2
    await page.getByRole('button', { name: 'Play' }).click()
    await page.getByLabel('Cut the tether').check()
    await expect(readout(page, 'Tension T = mω²r')).toHaveText('0.000\u00a0N')
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible() // live: not reset
  })
})
