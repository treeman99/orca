import React, { useCallback, useMemo } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import '@/lib/monaco-setup'
import { useAppStore } from '@/store'
import { computeEditorFontSize, resolveEditorFontFamily } from '@/lib/editor-font-zoom'
import { MAX_TOKENIZATION_LINE_LENGTH } from '@/lib/monaco-languages/monarch-embed-entry-budget'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { buildFileEditorWordWrapOptions } from '../file-editor-word-wrap-options'
import { monacoFindOptions } from '../monaco-find-options'
import { installMonacoEditorFindShortcut } from '../editor-shortcuts'

export function MergePaneTitle({
  title,
  detail,
  mono
}: {
  title: string
  detail?: string
  mono?: string
}): React.JSX.Element {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
      <span className="shrink-0 font-medium text-foreground">{title}</span>
      {detail ? <span className="min-w-0 truncate text-muted-foreground">{detail}</span> : null}
      {mono ? (
        <span className="shrink-0 font-mono text-2xs text-muted-foreground">{mono}</span>
      ) : null}
    </div>
  )
}

/**
 * One merge pane: the same Monaco setup, theme and font settings as the file editor, on a model
 * of its own that is disposed with the pane (the result's text lives in the tab's draft).
 */
export function MergeEditorPane({
  header,
  value,
  language,
  readOnly,
  ariaLabel,
  onEditorMount,
  onChange
}: {
  header: React.ReactNode
  value: string
  language: string
  readOnly: boolean
  ariaLabel: string
  onEditorMount: (instance: editor.IStandaloneCodeEditor) => void
  onChange?: (value: string) => void
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const isDark = useDocumentDarkTheme()
  const fontSize = computeEditorFontSize(settings?.terminalFontSize ?? 13, editorFontZoomLevel)
  const fontFamily = resolveEditorFontFamily(settings)
  const editorWordWrap = settings?.editorWordWrap
  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(
    () => ({
      readOnly,
      ariaLabel,
      dropIntoEditor: { enabled: false },
      maxTokenizationLineLength: MAX_TOKENIZATION_LINE_LENGTH,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      ...buildFileEditorWordWrapOptions(editorWordWrap),
      fontSize,
      fontFamily,
      lineNumbers: 'on',
      renderLineHighlight: readOnly ? 'none' : 'line',
      automaticLayout: true,
      tabSize: 2,
      padding: { top: 0 },
      find: monacoFindOptions
    }),
    [ariaLabel, editorWordWrap, fontFamily, fontSize, readOnly]
  )
  const handleMount = useCallback<OnMount>(
    (instance) => {
      const disposeFind = installMonacoEditorFindShortcut(instance)
      instance.onDidDispose(disposeFind)
      onEditorMount(instance)
    },
    [onEditorMount]
  )
  const handleChange = useCallback(
    (next: string | undefined) => {
      if (next !== undefined) {
        onChange?.(next)
      }
    },
    [onChange]
  )
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      <div className="relative min-h-0 flex-1">
        <Editor
          height="100%"
          value={value}
          language={language}
          theme={isDark ? 'vs-dark' : 'vs'}
          options={options}
          onMount={handleMount}
          onChange={onChange ? handleChange : undefined}
          saveViewState={false}
        />
      </div>
    </div>
  )
}
