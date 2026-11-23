/** Colours for canvas drawing, read from the design tokens (docs/DESIGN_SYSTEM.md). */
export interface Palette {
  background: string
  grid: string
  gridLabel: string
  ink: string
  muted: string
  line: string
  position: string
  velocity: string
  acceleration: string
  force: string
  energy: string
  theory: string
}

const FALLBACK: Palette = {
  background: '#131922', grid: '#253041', gridLabel: '#7d8a9c', ink: '#e6edf3', muted: '#9aa7b8', line: '#34425a',
  position: '#56b4e9', velocity: '#009e73', acceleration: '#cc79a7', force: '#e69f00', energy: '#f0e442', theory: '#c9d1d9',
}

export function readPalette(): Palette {
  if (typeof document === 'undefined') return FALLBACK
  const style = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => style.getPropertyValue(`--color-${name}`).trim() || fallback
  return {
    background: token('surface', FALLBACK.background),
    grid: token('line', FALLBACK.grid),
    gridLabel: token('faint', FALLBACK.gridLabel),
    ink: token('ink', FALLBACK.ink),
    muted: token('muted', FALLBACK.muted),
    line: token('line-strong', FALLBACK.line),
    position: token('q-position', FALLBACK.position),
    velocity: token('q-velocity', FALLBACK.velocity),
    acceleration: token('q-acceleration', FALLBACK.acceleration),
    force: token('q-force', FALLBACK.force),
    energy: token('q-energy', FALLBACK.energy),
    theory: token('q-theory', FALLBACK.theory),
  }
}
