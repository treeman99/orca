import { TriangleAlert } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { SearchResult } from '../../../../shared/code-search-types'

/**
 * Tell the user the search ran on the git-grep fallback instead of ripgrep.
 *
 * Why it exists: the fallback is narrower than ripgrep (git's own view of the
 * tree, and pathspecs it cannot always translate into a submodule), and until
 * now it engaged completely silently — which is why a repo returning only its
 * top-level docs looked like a search bug rather than a missing binary.
 *
 * `engine` is optional on the wire: a remote host that predates the field sends
 * nothing and this renders nothing, per remote-wire-compatibility Rule 1.
 */
export function SearchDegradedEngineNotice({
  results
}: {
  results: SearchResult | null
}): React.JSX.Element | null {
  if (results?.engine !== 'git-grep') {
    return null
  }
  const skipped = results.skippedSubmodules ?? []
  return (
    <div className="flex items-start gap-1 border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
      <TriangleAlert className="mt-px size-3 shrink-0 text-amber-500" aria-hidden="true" />
      <span>
        {translate(
          'search.fallbackEngine.notice',
          'ripgrep is not installed, so search is using a limited git-based fallback.'
        )}
        {skipped.length > 0 && (
          <>
            {' '}
            {translate(
              'search.fallbackEngine.skippedSubmodules',
              'These submodules were skipped because the file filter has no equivalent inside them: {{value0}}',
              { value0: skipped.join(', ') }
            )}
          </>
        )}
      </span>
    </div>
  )
}
