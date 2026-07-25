// Fork: feedback and crash reports are the last lane that POSTs user-authored
// text off the machine (onorca.dev), and disableTelemetry so far only stripped
// the diagnostic-bundle attachment — the report itself still left. Both the
// renderer `feedback:submit` channel and the crash dialog funnel through
// submitFeedback(), so the policy check belongs there, ahead of the request.

import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

export const ENTERPRISE_FEEDBACK_BLOCKED_ERROR =
  'Sending feedback and crash reports is disabled by your organization policy.'

/** The failure to return instead of posting, or null when submission is allowed. */
export function enterpriseBlockedFeedbackFailure(): { status: null; error: string } | null {
  return getEnterprisePolicy().disableTelemetry
    ? { status: null, error: ENTERPRISE_FEEDBACK_BLOCKED_ERROR }
    : null
}
