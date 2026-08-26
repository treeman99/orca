import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keeps the rail's current-section marker in step with the body.
 *
 * Why a scroll listener and not IntersectionObserver: the sections are tall enough that two of
 * them are on screen at once, so "is it visible" is the wrong question — the answer wanted is
 * "which heading did the reader last pass", which is a position comparison, not a visibility one.
 */
export function useUsageGuideActiveSection(initialId: string): {
  activeId: string
  selectSection: (id: string) => void
  registerSection: (id: string) => (node: HTMLElement | null) => void
  registerScrollContainer: (node: HTMLDivElement | null) => void
} {
  const [activeId, setActiveId] = useState(initialId)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  // State, not a ref: the dialog's content mounts inside a Radix portal, so a ref read in a
  // mount effect can still be null. Re-running the effect when the node arrives is the only
  // shape that reliably attaches the listener.
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)

  const registerSection = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) {
        sectionRefs.current.set(id, node)
      } else {
        sectionRefs.current.delete(id)
      }
    },
    []
  )

  const selectSection = useCallback((id: string): void => {
    setActiveId(id)
    // Guard: happy-dom and older webviews leave scrollIntoView undefined, and marking the
    // current section must keep working without it.
    sectionRefs.current.get(id)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const container = scrollContainer
    if (!container) {
      return
    }
    let frame = 0
    const sync = (): void => {
      frame = 0
      const containerTop = container.getBoundingClientRect().top
      let current: string | null = null
      for (const [id, node] of sectionRefs.current) {
        // 24px of slack so a heading counts as reached once it is comfortably in view.
        if (node.getBoundingClientRect().top - containerTop <= 24) {
          current = id
        }
      }
      if (current) {
        setActiveId(current)
      }
    }
    const onScroll = (): void => {
      if (frame === 0) {
        frame = requestAnimationFrame(sync)
      }
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (frame !== 0) {
        cancelAnimationFrame(frame)
      }
    }
  }, [scrollContainer])

  return {
    activeId,
    selectSection,
    registerSection,
    registerScrollContainer: setScrollContainer
  }
}
