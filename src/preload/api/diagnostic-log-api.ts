export type DiagnosticLogStatus = {
  enabled: boolean
  /** Resolved path, so the settings pane can show where the file actually lands. */
  filePath: string
}

export type DiagnosticLogApi = {
  /** Append one line to the troubleshooting log. No-op while the setting is off. */
  write: (topic: string, fields?: Record<string, string | number | boolean>) => Promise<boolean>
  status: () => Promise<DiagnosticLogStatus | null>
}
