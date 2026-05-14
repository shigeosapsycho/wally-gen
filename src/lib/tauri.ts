import { invoke } from '@tauri-apps/api/core'

// localStorage key + retention count for the "Autoclean Dumps" setting.
export const AUTOCLEAN_DUMPS_KEY = 'wally-gen.autoclean-dumps'
export const AUTOCLEAN_DUMPS_KEEP = 3

export const api = {
  targetDir: () => invoke<string>('target_dir'),
  readTextFile: (rel: string) => invoke<string>('read_text_file', { relPath: rel }),
  writeTextFile: (rel: string, content: string) =>
    invoke<void>('write_text_file', { relPath: rel, content }),
  readEnv: () => invoke<EnvLine[]>('read_env'),
  writeEnv: (values: Record<string, string>) => invoke<void>('write_env', { values }),
  // Prune dumps/ to the `keep` most-recent run folders; returns the count removed.
  autocleanDumps: (keep: number) => invoke<number>('autoclean_dumps', { keep }),
}

/** Whether the Autoclean Dumps setting is currently enabled. */
export function autocleanEnabled(): boolean {
  try {
    return window.localStorage.getItem(AUTOCLEAN_DUMPS_KEY) === 'on'
  } catch {
    return false
  }
}

export type EnvLine = { kind: 'raw'; data: string } | { kind: 'kv'; key: string; value: string }

/** Convert the ordered env-line list into a flat key/value map (last wins). */
export function envToMap(lines: EnvLine[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of lines) {
    if (l.kind === 'kv') out[l.key] = l.value
  }
  return out
}

/** Count non-empty, non-whitespace lines (for the email/proxy badges). */
export function countNonEmptyLines(text: string): number {
  let n = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length > 0) n++
  }
  return n
}
