/**
 * Modified Nodal Analysis (MNA) for linear DC circuits with resistors,
 * ideal voltage sources and capacitors. Node 0 is ground. Unknowns are the
 * node voltages plus one current per voltage source; the linear system is
 * solved by Gaussian elimination with partial pivoting.
 *
 * Capacitors are integrated with backward Euler (A-stable, first order):
 * over a step Δt a capacitor is replaced by a conductance C/Δt in parallel
 * with a current source (C/Δt)·V_prev.
 */

export type CircuitElement =
  | { kind: 'resistor'; id: string; a: number; b: number; resistance: number }
  | { kind: 'voltage'; id: string; a: number; b: number; voltage: number }
  | { kind: 'capacitor'; id: string; a: number; b: number; capacitance: number }

export interface Circuit {
  /** Number of nodes including ground (node 0). */
  nodes: number
  elements: CircuitElement[]
}

export interface Solution {
  /** Node voltages, V (index 0 = ground = 0). */
  voltages: Float64Array
  /** Current through each element from a to b, A (for sources: from a to b inside the source). */
  currents: Map<string, number>
}

/** Solve A x = b in place with partial pivoting. Throws if the matrix is singular. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r
    if (Math.abs(A[pivot][col]) < 1e-15) throw new Error('Circuit has no unique solution (floating node or source loop)')
    ;[A[col], A[pivot]] = [A[pivot], A[col]]
    ;[b[col], b[pivot]] = [b[pivot], b[col]]
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col]
      if (f === 0) continue
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c]
      b[r] -= f * b[col]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]
    x[r] = s / A[r][r]
  }
  return x
}

/**
 * Solve the circuit. With `dt` and previous capacitor voltages, capacitors
 * use the backward-Euler companion model; without `dt` they are open circuits
 * (the DC steady state).
 */
export function solveCircuit(circuit: Circuit, options: { dt?: number; capacitorVoltages?: Map<string, number> } = {}): Solution {
  const n = circuit.nodes - 1 // exclude ground
  const sources = circuit.elements.filter((e) => e.kind === 'voltage')
  const size = n + sources.length
  const A = Array.from({ length: size }, () => new Array<number>(size).fill(0))
  const b = new Array<number>(size).fill(0)
  const idx = (node: number) => node - 1
  const stamp = (a: number, c: number, g: number) => {
    if (a > 0) A[idx(a)][idx(a)] += g
    if (c > 0) A[idx(c)][idx(c)] += g
    if (a > 0 && c > 0) {
      A[idx(a)][idx(c)] -= g
      A[idx(c)][idx(a)] -= g
    }
  }
  const inject = (node: number, current: number) => {
    if (node > 0) b[idx(node)] += current
  }
  for (const e of circuit.elements) {
    if (e.kind === 'resistor') stamp(e.a, e.b, 1 / e.resistance)
    if (e.kind === 'capacitor' && options.dt) {
      const g = e.capacitance / options.dt
      const v = options.capacitorVoltages?.get(e.id) ?? 0
      stamp(e.a, e.b, g)
      inject(e.a, g * v)
      inject(e.b, -g * v)
    }
  }
  sources.forEach((s, k) => {
    if (s.kind !== 'voltage') return
    const row = n + k
    if (s.a > 0) {
      A[idx(s.a)][row] += 1
      A[row][idx(s.a)] += 1
    }
    if (s.b > 0) {
      A[idx(s.b)][row] -= 1
      A[row][idx(s.b)] -= 1
    }
    b[row] = s.voltage // V(a) − V(b) = voltage
  })
  const x = solveLinear(A, b)
  const voltages = new Float64Array(circuit.nodes)
  for (let i = 1; i < circuit.nodes; i++) voltages[i] = x[i - 1]
  const currents = new Map<string, number>()
  for (const e of circuit.elements) {
    const dv = voltages[e.a] - voltages[e.b]
    if (e.kind === 'resistor') currents.set(e.id, dv / e.resistance)
    if (e.kind === 'capacitor') {
      const prev = options.capacitorVoltages?.get(e.id) ?? 0
      currents.set(e.id, options.dt ? (e.capacitance * (dv - prev)) / options.dt : 0)
    }
  }
  // MNA's source unknown is the current flowing into terminal a from the
  // network; report the current delivered out of a (a → external circuit).
  sources.forEach((s, k) => currents.set(s.id, -x[n + k]))
  return { voltages, currents }
}

/** Net current leaving each node (Kirchhoff's current law residual), A. */
export function kirchhoffResiduals(circuit: Circuit, solution: Solution): number[] {
  const net = new Array<number>(circuit.nodes).fill(0)
  for (const e of circuit.elements) {
    const i = solution.currents.get(e.id) ?? 0
    if (e.kind === 'voltage') {
      // Source current i flows out of terminal a into the network, returning at b.
      net[e.a] -= i
      net[e.b] += i
    } else {
      net[e.a] += i
      net[e.b] -= i
    }
  }
  return net.slice(1)
}
