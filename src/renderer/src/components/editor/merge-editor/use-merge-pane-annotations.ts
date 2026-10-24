import { useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'
import { installDiffCommentZoneMouseDownStopper } from '../../diff-comments/diff-comment-zone-mouse-events'

export type MergeZoneItem = { key: string; label: string; run: () => void }

/** A one-line action bar above a range: an optional state label, then its actions. */
export type MergeZoneSpec = {
  key: string
  afterLineNumber: number
  label?: string
  items: MergeZoneItem[]
}

const ZONE_HEIGHT_PX = 22

function zoneSignature(zones: readonly MergeZoneSpec[]): string {
  return JSON.stringify(
    zones.map((zone) => [
      zone.key,
      zone.afterLineNumber,
      zone.label ?? '',
      zone.items.map((item) => [item.key, item.label])
    ])
  )
}

function buildZoneNode(zone: MergeZoneSpec, onItem: (itemKey: string) => void): HTMLElement {
  const node = document.createElement('div')
  node.className = 'orca-merge-zone'
  // Why: Monaco writes an inline display on the zone node itself, so the layout lives one level in.
  const row = document.createElement('div')
  row.className = 'orca-merge-zone-row'
  node.append(row)
  if (zone.label) {
    const label = document.createElement('span')
    label.className = 'orca-merge-zone-label'
    label.textContent = zone.label
    row.append(label)
  }
  for (const item of zone.items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'orca-merge-zone-action'
    button.textContent = item.label
    button.addEventListener('click', (event) => {
      event.preventDefault()
      onItem(item.key)
    })
    row.append(button)
  }
  return node
}

/**
 * Range highlights and the per-range action bars (Monaco view zones, as diff comments use).
 * Zones are rebuilt only when their text or position changes; clicks run the latest callbacks.
 */
export function useMergePaneAnnotations(
  editorInstance: editor.IStandaloneCodeEditor | null,
  decorations: editor.IModelDeltaDecoration[],
  zones: MergeZoneSpec[]
): void {
  const collectionRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const zonesRef = useRef(zones)
  zonesRef.current = zones
  const signature = zoneSignature(zones)

  useEffect(() => {
    if (!editorInstance) {
      return
    }
    const collection = editorInstance.createDecorationsCollection()
    collectionRef.current = collection
    return () => {
      collection.clear()
      collectionRef.current = null
    }
  }, [editorInstance])

  useEffect(() => {
    collectionRef.current?.set(decorations)
  }, [decorations, editorInstance])

  useEffect(() => {
    if (!editorInstance) {
      return
    }
    const runItem = (zoneKey: string, itemKey: string): void => {
      const zone = zonesRef.current.find((candidate) => candidate.key === zoneKey)
      zone?.items.find((item) => item.key === itemKey)?.run()
    }
    const zoneIds: string[] = []
    const disposers: (() => void)[] = []
    editorInstance.changeViewZones((accessor) => {
      for (const zone of zonesRef.current) {
        const domNode = buildZoneNode(zone, (itemKey) => runItem(zone.key, itemKey))
        // Why: keep the editor from taking focus or starting a selection on an action click.
        disposers.push(installDiffCommentZoneMouseDownStopper(domNode))
        zoneIds.push(
          accessor.addZone({
            afterLineNumber: zone.afterLineNumber,
            heightInPx: ZONE_HEIGHT_PX,
            domNode,
            suppressMouseDown: false
          })
        )
      }
    })
    return () => {
      for (const dispose of disposers) {
        dispose()
      }
      if (editorInstance.getModel()) {
        editorInstance.changeViewZones((accessor) => {
          for (const zoneId of zoneIds) {
            accessor.removeZone(zoneId)
          }
        })
      }
    }
  }, [editorInstance, signature])
}
