/** Physics module an experiment belongs to (Modules A–F in the project brief). */
export type ModuleId =
  | 'mechanics'
  | 'gravitation'
  | 'waves'
  | 'electromagnetism'
  | 'thermodynamics'
  | 'advanced'

/**
 * How the experiment relates to nature. Shown on every experiment so that a
 * simplified model is never presented as an exact description of reality.
 */
export type ModelFidelity = 'numerical' | 'analytic' | 'simplified'

export type Availability =
  | { status: 'available' }
  | { status: 'planned'; phase: string }

export interface ModuleInfo {
  id: ModuleId
  title: string
  description: string
}

export interface ExperimentInfo {
  /** URL-safe identifier, used in routes (/lab/:id) and saved experiments. */
  id: string
  title: string
  module: ModuleId
  summary: string
  fidelity: ModelFidelity
  /** The assumptions and omissions of the model, in plain language. */
  modelNotes: string
  availability: Availability
}
