import { opendir, readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/**
 * Where this build keeps the installable bytes of its bundled skills.
 *
 * Packaging copies the repository's `skills/` tree to `Resources/skills/packages`,
 * so an install never has to reach `npx`/GitHub for content the binary already
 * carries. Dev runs read the working tree directly.
 */
export function resolveBundledSkillPackageRoot(options: {
  resourcesPath?: string | null
  repoRoot?: string | null
}): string[] {
  const candidates: string[] = []
  if (options.resourcesPath) {
    candidates.push(join(options.resourcesPath, 'skills', 'packages'))
  }
  if (options.repoRoot) {
    candidates.push(join(options.repoRoot, 'skills'))
  }
  return candidates
}

export type BundledSkillPackageFile = {
  /** Slash-separated path relative to the package root. */
  path: string
  executable: boolean
  bytes: Buffer
}

// Why: the packages are hand-authored Markdown, so anything at this scale means the
// resource root is not what we think it is — refuse rather than copy it into agent homes.
const MAX_PACKAGE_FILES = 64
const MAX_PACKAGE_FILE_BYTES = 1024 * 1024

function assertInsideRoot(root: string, candidate: string): void {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
  ) {
    throw new Error(`Bundled skill path escapes its package root: ${candidate}`)
  }
}

/** Read one bundled skill package, sorted by path so callers hash a stable order. */
export async function readBundledSkillPackage(
  packageRoot: string,
  name: string
): Promise<BundledSkillPackageFile[]> {
  const root = join(packageRoot, name)
  const files: BundledSkillPackageFile[] = []
  const pending: string[] = ['']

  while (pending.length > 0) {
    const relativeDir = pending.pop() as string
    const absoluteDir = relativeDir ? join(root, relativeDir) : root
    assertInsideRoot(root, absoluteDir)
    const dir = await opendir(absoluteDir)
    for await (const entry of dir) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        pending.push(relativePath)
        continue
      }
      // Why: a symlink in the bundle would resolve against the user's machine, not ours.
      if (!entry.isFile()) {
        continue
      }
      if (files.length >= MAX_PACKAGE_FILES) {
        throw new Error(`Bundled skill "${name}" has more than ${MAX_PACKAGE_FILES} files.`)
      }
      const absolutePath = join(absoluteDir, entry.name)
      assertInsideRoot(root, absolutePath)
      const bytes = await readFile(absolutePath)
      if (bytes.byteLength > MAX_PACKAGE_FILE_BYTES) {
        throw new Error(`Bundled skill file is too large: ${name}/${relativePath}`)
      }
      files.push({ path: relativePath, executable: false, bytes })
    }
  }

  if (files.length === 0) {
    throw new Error(`Bundled skill "${name}" has no files at ${root}.`)
  }
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
}
