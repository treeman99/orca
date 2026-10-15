// Fork: the AppImage identity check from upstream's linux-update-package-type.ts. That module is
// updater code this build removed, but the clipboard publisher reuses this one predicate.
import path from 'node:path'

function isAbsolutePathString(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && !value.includes('\0') && path.isAbsolute(value)
  )
}

function isInsideDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

export function isLegacyAppImageRuntimeIdentity(identity: {
  appImagePath: unknown
  appDirPath: unknown
  execPath: unknown
  resourcesPath: unknown
}): boolean {
  if (
    !isAbsolutePathString(identity.appImagePath) ||
    !isAbsolutePathString(identity.appDirPath) ||
    !isAbsolutePathString(identity.execPath) ||
    !isAbsolutePathString(identity.resourcesPath)
  ) {
    return false
  }
  return (
    isInsideDirectory(identity.appDirPath, identity.execPath) &&
    isInsideDirectory(identity.appDirPath, identity.resourcesPath)
  )
}
