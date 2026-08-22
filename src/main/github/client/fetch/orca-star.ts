import { execFileAsync, acquire, release } from '../../gh-utils'
import { getEnterprisePolicy } from '../../../enterprise/enterprise-policy-file'
export const ORCA_REPO = 'stablyai/orca'

/**
 * Check if the authenticated user has starred the Orca repo.
 * Returns true if starred, false if not, null if unable to determine (gh unavailable).
 */
export async function checkOrcaStarred(): Promise<boolean | null> {
  // Why: this hits github.com SaaS, which a locked-down deployment cannot reach.
  // "Already starred" is the only answer every caller degrades quietly on — null
  // routes the nag to a browser handoff and false shows the prompt outright.
  if (getEnterprisePolicy().disableStarNag) {
    return true
  }
  await acquire()
  try {
    const { stdout, stderr } = await execFileAsync(
      'gh',
      ['api', '--include', `user/starred/${ORCA_REPO}`],
      { encoding: 'utf-8' }
    )
    const response = `${stdout ?? ''}\n${stderr ?? ''}`
    if (/HTTP\/\S+\s+(?:200|204)\b/.test(response)) {
      return true
    }
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // 404 means the user hasn't starred — the only expected "no" answer
    if (message.includes('HTTP 404')) {
      return false
    }
    // Anything else (gh not installed, not authenticated, network issue)
    return null
  } finally {
    release()
  }
}

/**
 * Star the Orca repo for the authenticated user.
 */
export async function starOrca(): Promise<boolean> {
  // Why: an authenticated PUT to github.com SaaS; report the ordinary failure so
  // callers keep their existing "could not star" path instead of a new branch.
  if (getEnterprisePolicy().disableStarNag) {
    return false
  }
  await acquire()
  try {
    await execFileAsync('gh', ['api', '-X', 'PUT', `user/starred/${ORCA_REPO}`], {
      encoding: 'utf-8'
    })
    return true
  } catch {
    return false
  } finally {
    release()
  }
}
