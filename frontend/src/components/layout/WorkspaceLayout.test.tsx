// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceLayout } from './WorkspaceLayout'

const originalMatchMedia = window.matchMedia

function setViewport(isDesktop: boolean) {
  window.matchMedia = (query: string) => ({ ...originalMatchMedia(query), matches: isDesktop })
}

function renderLayout() {
  render(
    <WorkspaceLayout left={<p>params</p>} center={<p>canvas</p>} right={<p>measurements</p>} bottom={<p>transport</p>} />,
  )
}

describe('WorkspaceLayout', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('renders all four regions in a resizable layout on desktop', () => {
    setViewport(true)
    renderLayout()
    expect(screen.getByTestId('workspace-resizable')).toBeInTheDocument()
    for (const text of ['params', 'canvas', 'measurements', 'transport']) expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  it('stacks the regions with the canvas first on narrow screens', () => {
    setViewport(false)
    renderLayout()
    const stacked = screen.getByTestId('workspace-stacked')
    expect(stacked.textContent).toBe('canvastransportparamsmeasurements')
  })
})
