# Design System

Tokens live in `frontend/src/styles/index.css` (Tailwind v4 `@theme static`).
A live reference is available in development at `/dev/design-system`; it is
excluded from production builds.

## Principles

1. **The data is the subject.** Interface chrome is low-contrast and neutral;
   colour is reserved for physical quantities and interactive elements.
2. **A quantity has one colour everywhere.** Velocity is the same green in a
   vector overlay, a graph line and a readout label, in every experiment.
3. **Theory is dashed and neutral** (`q-theory`). Simulated data is solid and
   coloured. The two are never visually confused.
4. **Numbers do not jitter.** Readouts use IBM Plex Mono with tabular figures.
5. **Precision is honest.** Values are shown to a stated number of significant
   figures; scientific notation is used whenever fixed notation would imply
   more precision than exists (`utils/format.ts`). `NaN` is shown as "—".

## Colour tokens

| Token group | Tokens | Use |
|---|---|---|
| Surfaces | `canvas` → `base` → `surface` → `raised`, `line`, `line-strong` | Page, panels, controls, borders |
| Text | `ink`, `muted`, `faint` | Primary, secondary, tertiary text |
| Accent | `accent`, `accent-strong`, `accent-ink` | Interactive elements only — never data |
| Status | `ok`, `warn`, `danger` | System status, model-fidelity warnings |
| Quantities | `q-position`, `q-velocity`, `q-acceleration`, `q-force`, `q-energy`, `q-momentum`, `q-theory` | Data series, vectors |

Exception: when one chart shows several components of the same quantity
(e.g. x and y position), the components need distinct colours; the legend and
CSV headers name each one.

Quantity colours are the Okabe–Ito palette, chosen to remain distinguishable
under the most common colour-vision deficiencies. Colour is still never the
*only* channel: graphs carry legends and vectors carry labels.

### Measured contrast (WCAG 2.x, computed, not estimated)

| Text token | on `base` | on `raised` (worst case) |
|---|---|---|
| `ink` | 16.0 : 1 | 13.5 : 1 |
| `muted` | 7.7 : 1 | 6.5 : 1 |
| `faint` | 5.4 : 1 | 4.6 : 1 |
| `accent` | 9.4 : 1 | 8.0 : 1 |

All text tokens meet AA (4.5 : 1) on every surface. All quantity colours
exceed the 3 : 1 non-text threshold on `surface` (lowest: `q-momentum`, 4.6 : 1).

## Components (`frontend/src/components`)

| Component | Purpose |
|---|---|
| `ui/Button` | `primary` (one per region), `secondary`, `ghost` |
| `ui/Badge` | Short status labels (fidelity, availability) |
| `ui/Panel` | Titled workspace region |
| `ui/ParameterControl` | Slider + exact numeric entry; clamps to range, rejects invalid text |
| `ui/Readout` | Labelled measurement with unit and significant figures |
| `layout/WorkspaceLayout` | Resizable three-panel layout on ≥ 1024 px; stacked below (canvas first) |
| `layout/TransportBar` | Play/pause, step, reset, speed, simulated time |

## Accessibility rules already enforced

- Visible focus ring on every focusable element (`:focus-visible`).
- All inputs have programmatic labels; sliders have distinct accessible names.
- Resize handles are keyboard-operable (arrow keys).
- The ticking simulation clock is deliberately **not** a live region (it would
  flood screen readers ~10 times per second).
- `prefers-reduced-motion` disables transitions.
