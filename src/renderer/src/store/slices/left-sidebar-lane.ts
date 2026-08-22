import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

/** Which roster the left sidebar shows below its nav: the workspace list, or the bots. */
export type LeftSidebarLane = 'sessions' | 'bots'

export type LeftSidebarLaneSlice = {
  leftSidebarLane: LeftSidebarLane
  setLeftSidebarLane: (lane: LeftSidebarLane) => void
}

// Why its own slice rather than a field on UISlice: ui.ts is already 8x the max-lines cap
// and carries an inline disable. A new lane has no reason to grow that file further.
//
// Session-only on purpose for now. Persisting the lane means four more contract edits
// (PersistedUIState, the debounced writer, the strict RPC schema, hydration) and a value
// domain that paired web/mobile clients would reject; the tab costs one click to restore.
export const createLeftSidebarLaneSlice: StateCreator<AppState, [], [], LeftSidebarLaneSlice> = (
  set
) => ({
  leftSidebarLane: 'sessions',
  setLeftSidebarLane: (lane) => set({ leftSidebarLane: lane })
})
