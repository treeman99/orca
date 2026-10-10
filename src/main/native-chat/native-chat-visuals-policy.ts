// Fork: an inline visual is agent-written HTML whose CSP admits public CDNs
// (native-chat-visual-shell.ts), so the corporate policy can turn the whole lane off.
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

export function nativeChatVisualsAllowed(settings: { nativeChatInlineVisuals?: boolean }): boolean {
  return !getEnterprisePolicy().disableChatVisuals && settings.nativeChatInlineVisuals !== false
}
