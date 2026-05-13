import { api } from './tauri'

const ACCOUNTS_HEADER = 'email,password,authCode,identityToken,otp'
const FAILED_HEADER = 'email,outcome,error_code,error_msg,ts,password'

type Row = Record<string, string>

export type PromoteResult = {
  promoted: number
  error?: string
}

/**
 * Sweep `accounts-failed.csv` for `EMAIL_EXISTS` rows whose email isn't
 * already in `accounts.csv`, append them to `accounts.csv` with the
 * password / authCode / otp fields literally set to "MANUAL" (the user
 * will need to retrieve real credentials by hand), and rewrite
 * `accounts-failed.csv` with those rows removed.
 *
 * Caller MUST guarantee no run is in progress — this rewrites both CSVs
 * and would race with the engine's appends otherwise.
 */
export async function promoteEmailExists(): Promise<PromoteResult> {
  try {
    const [accountsCsv, failedCsv] = await Promise.all([
      api.readTextFile('accounts.csv').catch(() => ''),
      api.readTextFile('accounts-failed.csv').catch(() => ''),
    ])

    const success = parseCsv(accountsCsv, ACCOUNTS_HEADER.split(','))
    const failed = parseCsv(failedCsv, FAILED_HEADER.split(','))

    const existing = new Set<string>()
    for (const r of success.rows) {
      const e = (r['email'] ?? '').trim().toLowerCase()
      if (e) existing.add(e)
    }

    const toPromote: Row[] = []
    const toKeep: Row[] = []
    for (const r of failed.rows) {
      const outcome = (r['outcome'] ?? '').trim()
      const email = (r['email'] ?? '').trim()
      if (outcome === 'EMAIL_EXISTS' && email && !existing.has(email.toLowerCase())) {
        toPromote.push(r)
        existing.add(email.toLowerCase())
      } else {
        toKeep.push(r)
      }
    }

    if (toPromote.length === 0) return { promoted: 0 }

    // Build the new accounts.csv: existing content (with a header on top if
    // it didn't already have one) + the promoted rows appended.
    const promotedLines = toPromote.map(
      (r) => `${escapeCsv(r['email'] ?? '')},MANUAL,MANUAL,,MANUAL`,
    )

    const accountsTrimmed = accountsCsv.replace(/\r?\n$/, '')
    const hasAccountsHeader = startsWithHeader(accountsTrimmed, 'email')
    let newAccountsCsv: string
    if (accountsTrimmed === '') {
      newAccountsCsv = ACCOUNTS_HEADER + '\n' + promotedLines.join('\n') + '\n'
    } else if (hasAccountsHeader) {
      newAccountsCsv = accountsTrimmed + '\n' + promotedLines.join('\n') + '\n'
    } else {
      newAccountsCsv =
        ACCOUNTS_HEADER + '\n' + accountsTrimmed + '\n' + promotedLines.join('\n') + '\n'
    }

    // Rewrite accounts-failed.csv minus the promoted rows. Always emit a
    // proper header so the file stays well-formed.
    const failedBody = toKeep
      .map((r) =>
        [
          escapeCsv(r['email'] ?? ''),
          escapeCsv(r['outcome'] ?? ''),
          escapeCsv(r['error_code'] ?? ''),
          escapeCsv(r['error_msg'] ?? ''),
          escapeCsv(r['ts'] ?? ''),
          escapeCsv(r['password'] ?? ''),
        ].join(','),
      )
      .join('\n')
    const newFailedCsv =
      failedBody.length > 0 ? FAILED_HEADER + '\n' + failedBody + '\n' : FAILED_HEADER + '\n'

    await api.writeTextFile('accounts.csv', newAccountsCsv)
    await api.writeTextFile('accounts-failed.csv', newFailedCsv)

    return { promoted: toPromote.length }
  } catch (e) {
    return { promoted: 0, error: String(e) }
  }
}

function startsWithHeader(text: string, firstCol: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const firstCell = parseCsvRow(firstLine)[0] ?? ''
  return firstCell.trim().toLowerCase() === firstCol.toLowerCase()
}

function parseCsv(text: string, fallbackSchema: string[]): { headers: string[]; rows: Row[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: fallbackSchema, rows: [] }
  const firstCells = parseCsvRow(lines[0]!)
  const looksLikeHeader =
    (firstCells[0] ?? '').trim().toLowerCase() === (fallbackSchema[0] ?? '').toLowerCase()
  const headers = looksLikeHeader ? firstCells : fallbackSchema
  const startIdx = looksLikeHeader ? 1 : 0
  const rows: Row[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]!)
    const row: Row = {}
    for (let j = 0; j < headers.length; j++) row[headers[j]!] = cells[j] ?? ''
    rows.push(row)
  }
  return { headers, rows }
}

function parseCsvRow(row: string): string[] {
  const out: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const c = row[i]!
    if (inQuotes) {
      if (c === '"') {
        if (row[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === ',') {
      out.push(field)
      field = ''
    } else if (c === '"' && field.length === 0) {
      inQuotes = true
    } else if (c === '\r') {
      // skip
    } else field += c
  }
  out.push(field)
  return out
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
