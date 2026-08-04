import { cpSync, renameSync, rmSync } from 'node:fs'

// Why: Windows applies MOVEFILE_COPY_ALLOWED to files only, so renaming a directory
// across volumes fails as ERROR_ACCESS_DENIED, which libuv maps to EPERM — permanently,
// not transiently. Antivirus handles on a freshly written tree add EACCES/EBUSY.
const recoverableRenameErrorCodes = new Set([
  'EACCES',
  'EBUSY',
  'EEXIST',
  'ENOTEMPTY',
  'EPERM',
  'EXDEV'
])

/** Moves sourcePath onto destinationPath, replacing it. Returns 'rename' or 'copy'. */
export function movePathWithCopyFallback(
  sourcePath,
  destinationPath,
  { rename = renameSync } = {}
) {
  try {
    rename(sourcePath, destinationPath)
    return 'rename'
  } catch (/** @type {any} */ error) {
    if (!recoverableRenameErrorCodes.has(error?.code)) {
      throw error
    }

    // Why: EEXIST/ENOTEMPTY mean the destination survived; copying into it would keep stale files.
    rmSync(destinationPath, { force: true, recursive: true })
    // Why: macOS Electron dist/ only launches while its framework symlinks stay symlinks.
    cpSync(sourcePath, destinationPath, {
      dereference: false,
      recursive: true,
      verbatimSymlinks: true
    })
    rmSync(sourcePath, { force: true, recursive: true })
    return 'copy'
  }
}
