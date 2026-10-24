// @vitest-environment happy-dom
// Fork-owned: the onboarding language switcher must not offer a request that would go to the
// vendor feedback endpoint this build removed.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { detectUiLanguage, setRendererLanguageDetection } from '../../../../shared/ui-locale'
import { useAppStore } from '@/store'
import { i18n } from '@/i18n/i18n'
import * as languageReadiness from '@/i18n/language-readiness'
import { useLanguageReadiness } from '@/i18n/language-readiness'
import { usePluginLanguagePackStore } from '@/store/plugin-language-packs'
import { OnboardingLanguageSwitcher } from './OnboardingLanguageSwitcher'

beforeEach(async () => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ settings: getDefaultSettings('/tmp') })
  useLanguageReadiness.setState({ ...useLanguageReadiness.getInitialState(), ready: true })
  usePluginLanguagePackStore.setState({ entries: [], loaded: true })
  vi.spyOn(languageReadiness, 'initializeLanguageDetection').mockResolvedValue(
    detectUiLanguage(['de-DE'], 'native')
  )
  setRendererLanguageDetection(detectUiLanguage(['de-DE'], 'native'))
  Object.defineProperty(window, 'api', { configurable: true, value: { telemetryTrack: vi.fn() } })
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('onboarding language switcher in this build', () => {
  it('offers the built-in languages but no request for another one', () => {
    render(<OnboardingLanguageSwitcher open onOpenChange={vi.fn()} />)

    expect(screen.getAllByRole('radio').length).toBeGreaterThan(1)
    expect(screen.queryByRole('button', { name: 'Other language…' })).toBeNull()
  })
})
