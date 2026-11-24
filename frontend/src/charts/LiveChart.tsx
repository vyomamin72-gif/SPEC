import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import './chart.css'
import { formatScalar } from '@/utils/format'
import { readPalette } from '@/rendering/palette'
import type { ChartData } from '@/simulations/controller'
import type { ChannelSpec, ChartSpec } from '@/simulations/types'

export interface LiveChartProps {
  chart: ChartSpec
  channels: readonly ChannelSpec[]
  getData: (chart: ChartSpec) => ChartData
  /** Changes whenever new data should be drawn. */
  dataVersion: number
  timeUnit?: string
}

const AXIS_FONT = '11px "IBM Plex Sans", system-ui, sans-serif'
const formatValue = (_u: uPlot, v: number | null) => (v == null ? '—' : formatScalar(v, { sigFigs: 4 }))

/**
 * Canvas-based time-series chart (uPlot). Created once per chart spec and fed
 * new data when `dataVersion` changes; React never re-renders the plot itself.
 */
export function LiveChart({ chart, channels, getData, dataVersion, timeUnit = 's' }: LiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const palette = readPalette()
    const label = (key: string) => channels.find((c) => c.key === key)?.label ?? key
    const axis = {
      stroke: palette.muted,
      font: AXIS_FONT,
      labelFont: AXIS_FONT,
      grid: { stroke: palette.grid, width: 1 },
      ticks: { stroke: palette.grid, width: 1 },
    }
    const options: uPlot.Options = {
      width: Math.max(container.clientWidth, 200),
      height: 160,
      scales: { x: { time: false } },
      series: [
        { label: `t (${timeUnit})`, value: formatValue },
        ...chart.series.map((s) => ({
          label: label(s.key),
          stroke: palette[s.color],
          width: s.theory ? 1.5 : 2,
          dash: s.theory ? [6, 4] : undefined,
          points: { show: false },
          value: formatValue,
        })),
      ],
      axes: [
        { ...axis, label: `Time (${timeUnit})` },
        { ...axis, label: chart.unit, size: 56 },
      ],
      legend: { live: true },
      cursor: { drag: { x: false, y: false } },
    }
    const plot = new uPlot(options, getData(chart) as uPlot.AlignedData, container)
    plotRef.current = plot
    const fit = () => {
      const legend = plot.root.querySelector<HTMLElement>('.u-legend')
      plot.setSize({
        width: Math.max(container.clientWidth, 200),
        height: Math.max(container.clientHeight - (legend?.offsetHeight ?? 0) - 4, 100),
      })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => {
      observer.disconnect()
      plot.destroy()
      plotRef.current = null
    }
  }, [chart, channels, getData, timeUnit])

  useEffect(() => {
    plotRef.current?.setData(getData(chart) as uPlot.AlignedData)
  }, [chart, getData, dataVersion])

  return <div ref={containerRef} className="live-chart size-full min-h-40 overflow-hidden" data-testid={`chart-${chart.id}`} />
}
