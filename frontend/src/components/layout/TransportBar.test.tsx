// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransportBar } from './TransportBar'
import type { TransportBarProps } from './TransportBar'

function renderBar(overrides: Partial<TransportBarProps> = {}) {
  const props: TransportBarProps = {
    isRunning: false,
    simTime: 1.5,
    speed: 1,
    speedOptions: [0.25, 1, 4],
    onPlayPause: vi.fn(),
    onReset: vi.fn(),
    onStep: vi.fn(),
    onSpeedChange: vi.fn(),
    ...overrides,
  }
  render(<TransportBar {...props} />)
  return props
}

describe('TransportBar', () => {
  it('wires every control to its callback', async () => {
    const props = renderBar()
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    await userEvent.click(screen.getByRole('button', { name: 'Step' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await userEvent.selectOptions(screen.getByLabelText('Simulation speed'), '4')
    expect(props.onPlayPause).toHaveBeenCalledOnce()
    expect(props.onStep).toHaveBeenCalledOnce()
    expect(props.onReset).toHaveBeenCalledOnce()
    expect(props.onSpeedChange).toHaveBeenCalledWith(4)
  })

  it('does not expose the ticking clock as a live region', () => {
    renderBar()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('disables single-stepping while running', () => {
    renderBar({ isRunning: true })
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Step' })).toBeDisabled()
  })

  it('shows simulated time and the falling-behind warning', () => {
    renderBar({ simTime: 12.3456, isFallingBehind: true })
    expect(screen.getByTestId('sim-time')).toHaveTextContent('12.35')
    expect(screen.getByRole('status')).toHaveTextContent(/slower than requested/)
  })
})
