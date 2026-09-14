import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { isWebClientLocation } from '@/lib/web-client-location'

/**
 * Why: Ghostty publishes no Windows build, so `previewGhosttyImport` on a Windows
 * host can only ever come back `found: false` — the button is a dead end there.
 * Onboarding already gates its discovery row to darwin (`ThemeStep`); the settings
 * button was the one entry point that shipped ungated.
 *
 * The web client is exempt because `getRendererAppPlatform()` reports the browser's
 * OS, not the host's; since v1.4.201 the web client hides every desktop theme import
 * anyway (`showDesktopThemeImports`), so this only decides the Windows desktop case.
 */
export function isGhosttyImportAvailable(): boolean {
  return isWebClientLocation() || getRendererAppPlatform() !== 'win32'
}
