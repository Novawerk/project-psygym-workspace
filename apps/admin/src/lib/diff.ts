export type DiffLine = { op: " " | "-" | "+"; text: string }

/** Line diff (LCS). Fine for case files, which are a few hundred lines at most. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n")
  const b = after.split("\n")
  const n = a.length
  const m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ op: "-", text: a[i++] })
    else out.push({ op: "+", text: b[j++] })
  }
  while (i < n) out.push({ op: "-", text: a[i++] })
  while (j < m) out.push({ op: "+", text: b[j++] })
  return out
}

/** Keeps changed lines plus `context` lines around them; long unchanged runs become one "…". */
export function compact(lines: DiffLine[], context = 2): (DiffLine | null)[] {
  const keep = lines.map((l) => l.op !== " ")
  const show = lines.map((_, i) => keep.slice(Math.max(0, i - context), i + context + 1).some(Boolean))
  const out: (DiffLine | null)[] = []
  lines.forEach((l, i) => {
    if (show[i]) out.push(l)
    else if (out[out.length - 1] !== null) out.push(null)
  })
  return out
}
