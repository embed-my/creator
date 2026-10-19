/**
 * The part of `@missing-elements/h5p-verify` the tests use. The package is JavaScript and ships no
 * declarations; these follow the JSDoc in its `lib/verify.mjs` (1.0.0).
 */
declare module '@missing-elements/h5p-verify' {
  export interface VerifyOptions {
    /** The `.h5p` to play. */
    file: string
    /** Where libraries come from: `pack`, a bundle's URL or path, or a copy of the pack's `parts/` folder. */
    libraries?: string
    /** Play it as a site plays a package it did not make, through the content check. */
    untrusted?: boolean
    refreshLibraries?: boolean
    /** Where `report.json` and `screenshot.png` go; nothing is written without it. */
    out?: string
    browser?: string
    /** Milliseconds allowed to reach `ready`; default 60 000. */
    readyTimeout?: number
    /** Milliseconds watched after `ready` for late errors; default 3 000. */
    settle?: number
  }

  export interface VerifyReport {
    file: string
    verdict: 'pass' | 'fail'
    reasons: string[]
    warnings: string[]
    state: string
    readyMs: number | null
    /** Played untrusted: what the content check noted, and every field it changed (`null` if it could not compare). */
    contentCheck: { notes: string[]; changes: { path: string; change: string }[] | null } | null
    [key: string]: unknown
  }

  export function verifyPackage(options: VerifyOptions): Promise<VerifyReport>
  /** A short, human-readable account of a report. */
  export function summarize(report: VerifyReport): string
  export class VerifyError extends Error {}
}
