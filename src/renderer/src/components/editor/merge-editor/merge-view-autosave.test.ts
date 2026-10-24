// Why: D3 — while a conflict is in the merge view its buffer holds the reset result without
// markers, so autosave must not write it; only Complete Merge or an explicit save may.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestEditorFileSave } from '../editor-autosave'
import { attachEditorAutosaveController } from '../editor-autosave-controller'
import { __clearSelfWriteRegistryForTests } from '../editor-self-write-registry'
import {
  createEditorStore,
  stubEditorWindow,
  withLoadedBaselines
} from '../editor-autosave-controller-test-fixture'

const mocks = vi.hoisted(() => ({ getConnectionIdForFile: vi.fn() }))

vi.mock('@/lib/connection-context', () => ({
  getConnectionIdForFile: mocks.getConnectionIdForFile
}))

const FILE = '/repo/conflict.ts'

function openFile(store: ReturnType<typeof createEditorStore>): void {
  store.getState().openFile({
    filePath: FILE,
    relativePath: 'conflict.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    mode: 'edit'
  })
}

function editDraft(store: ReturnType<typeof createEditorStore>, draft: string): void {
  store.getState().setEditorDraft(FILE, draft)
  store.getState().markFileDirty(FILE, true)
}

describe('autosave in the merge view', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.getConnectionIdForFile.mockReset()
    mocks.getConnectionIdForFile.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    __clearSelfWriteRegistryForTests()
  })

  it('does not autosave the merge result, and resumes once the tab leaves the merge view', async () => {
    const writeFile = stubEditorWindow()
    const store = createEditorStore()
    openFile(store)
    store.getState().setEditorViewMode(FILE, 'merge')
    const cleanup = attachEditorAutosaveController(withLoadedBaselines(store))
    try {
      editDraft(store, 'merged without markers')
      await vi.advanceTimersByTimeAsync(5000)
      expect(writeFile).not.toHaveBeenCalled()

      store.getState().setEditorViewMode(FILE, 'edit')
      editDraft(store, 'back in the text editor')
      await vi.advanceTimersByTimeAsync(1000)
      expect(writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ filePath: FILE, content: 'back in the text editor' })
      )
    } finally {
      cleanup()
    }
  })

  it('drops an autosave scheduled before the tab entered the merge view', async () => {
    const writeFile = stubEditorWindow()
    const store = createEditorStore()
    openFile(store)
    const cleanup = attachEditorAutosaveController(withLoadedBaselines(store))
    try {
      editDraft(store, 'typed before merge')
      await vi.advanceTimersByTimeAsync(500)
      store.getState().setEditorViewMode(FILE, 'merge')
      await vi.advanceTimersByTimeAsync(5000)
      expect(writeFile).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it('still writes an explicit save while in the merge view', async () => {
    const writeFile = stubEditorWindow()
    const store = createEditorStore()
    openFile(store)
    store.getState().setEditorViewMode(FILE, 'merge')
    const cleanup = attachEditorAutosaveController(withLoadedBaselines(store))
    try {
      editDraft(store, 'resolved by hand')
      await requestEditorFileSave({ fileId: FILE })
      expect(writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ filePath: FILE, content: 'resolved by hand' })
      )
    } finally {
      cleanup()
    }
  })
})
