export interface CsvColumn {
  header: string
  values: ArrayLike<number>
}

function escapeField(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * RFC 4180-style CSV. Numbers are written with String(), the shortest text
 * that parses back to exactly the same double, so no precision is lost.
 * Non-finite values (e.g. a theory curve that does not apply) become empty cells.
 */
export function toCsv(columns: readonly CsvColumn[]): string {
  const rows = Math.max(0, ...columns.map((c) => c.values.length))
  const lines = [columns.map((c) => escapeField(c.header)).join(',')]
  for (let r = 0; r < rows; r++) {
    lines.push(
      columns
        .map((c) => {
          const v = c.values[r]
          return v === undefined || !Number.isFinite(v) ? '' : String(v)
        })
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}
