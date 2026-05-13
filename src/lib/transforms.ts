// Ported from C:\multitool\src\renderer\src\lib\transforms.ts.
// Only the functions the Wally Gen email-filter flow uses are kept.

export function filterEmailsBySuccess(successText: string, masterText: string): string[] {
  const successEmails = new Set<string>()
  for (const line of successText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const email = trimmed.split(':')[0]!.toLowerCase()
    if (email) successEmails.add(email)
  }
  const out: string[] = []
  for (const line of masterText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (!successEmails.has(trimmed.toLowerCase())) out.push(trimmed)
  }
  return out
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
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === ',') {
        out.push(field)
        field = ''
      } else if (c === '"' && field.length === 0) {
        inQuotes = true
      } else if (c === '\r') {
        // skip
      } else {
        field += c
      }
    }
  }
  out.push(field)
  return out
}

export type CsvEmailPassResult = {
  lines: string[]
  emailHeader: string | null
  passwordHeader: string | null
}

export function csvToEmailPass(text: string): CsvEmailPassResult {
  const rows = text.split(/\n/).filter((r) => r.length > 0 || r === '')
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.trim().length > 0) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return { lines: [], emailHeader: null, passwordHeader: null }

  const header = parseCsvRow(rows[headerIdx]!).map((h) => h.trim())
  const norm = header.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''))
  const emailNames = new Set(['email', 'emailaddress', 'mail', 'username', 'user', 'login'])
  const passwordNames = new Set(['password', 'pass', 'pwd', 'passcode'])

  const emailIdx = norm.findIndex((h) => emailNames.has(h))
  const passwordIdx = norm.findIndex((h) => passwordNames.has(h))
  if (emailIdx === -1 || passwordIdx === -1) {
    return { lines: [], emailHeader: null, passwordHeader: null }
  }

  const out: string[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!
    if (!row.trim()) continue
    const cells = parseCsvRow(row)
    const email = (cells[emailIdx] ?? '').trim()
    const password = (cells[passwordIdx] ?? '').trim()
    if (!email || !password) continue
    out.push(`${email}:${password}`)
  }
  return { lines: out, emailHeader: header[emailIdx]!, passwordHeader: header[passwordIdx]! }
}
