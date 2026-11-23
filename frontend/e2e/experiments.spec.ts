import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

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
