// A `translateMain` seam for main modules the Orca runtime reaches.
//
// `main-i18n.ts` imports electron's `app` for the system locale, and
// config/scripts/check-runtime-electron-ratchet.mjs fails the build for any module in the
// runtime's import graph that pulls `electron` in. Fork gates that produce user-facing copy
// from inside that graph (the GitHub stack-merge refusal) go through this port instead.
//
// The desktop installs the real translator during startup; a plain-Node host keeps the
// English fallback, which is the honest answer where there is no system locale to read.

import type { TOptions } from 'i18next'

export type MainTranslate = (key: string, fallback: string, options?: TOptions) => string

/** Interpolates `{{name}}` the way i18next would, so an uninstalled host still reads correctly. */
function englishFallback(_key: string, fallback: string, options?: TOptions): string {
  return fallback.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) => {
    const value = options?.[name]
    return value === undefined || value === null ? placeholder : String(value)
  })
}

let current: MainTranslate = englishFallback

export function setMainTranslator(translate: MainTranslate | null): void {
  current = translate ?? englishFallback
}

export function translateInRuntime(key: string, fallback: string, options?: TOptions): string {
  return current(key, fallback, options)
}
