// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ParameterControl, parseParameterInput, toEditableText } from './ParameterControl'

describe('parseParameterInput', () => {
  it('parses and clamps numbers', () => {
    expect(parseParameterInput('12.5', 0, 100)).toBe(12.5)
    expect(parseParameterInput('500', 0, 100)).toBe(100)
    expect(parseParameterInput('-5', 0, 100)).toBe(0)
  })

  it('accepts a typographic minus and a decimal comma', () => {
    expect(parseParameterInput('−2', -10, 10)).toBe(-2)
    expect(parseParameterInput('9,81', 0, 20)).toBe(9.81)
  })

  it('rejects non-numeric input instead of returning 0', () => {
    expect(parseParameterInput('', 0, 10)).toBeNull()
    expect(parseParameterInput('abc', 0, 10)).toBeNull()
    expect(parseParameterInput('Infinity', 0, 10)).toBeNull()
  })
})

describe('toEditableText', () => {
  it('produces text that parses back to the same value', () => {
    for (const v of [30, 0.1 + 0.2, 6.674e-11, 1.989e30, -9.81]) {
      expect(Number(toEditableText(v))).toBeCloseTo(v, 5 - Math.floor(Math.log10(Math.abs(v))))
    }
    expect(toEditableText(0.1 + 0.2)).toBe('0.3')
  })
})

describe('ParameterControl', () => {
  function setup(onChange = vi.fn()) {
    render(<ParameterControl label="Launch angle" unit="°" value={30} min={0} max={90} step={1} onChange={onChange} />)
    return { onChange, input: screen.getByLabelText('Launch angle') }
  }

  it('commits a typed value on Enter, clamped to range', async () => {
    const { onChange, input } = setup()
    await userEvent.clear(input)
    await userEvent.type(input, '120{Enter}')
    expect(onChange).toHaveBeenCalledWith(90)
  })

  it('discards invalid text and restores the current value', async () => {
    const { onChange, input } = setup()
    await userEvent.clear(input)
    await userEvent.type(input, 'steep')
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('30')
  })

  it('reports slider movement', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('Launch angle slider'), { target: { value: '45' } })
    expect(onChange).toHaveBeenCalledWith(45)
  })
})
