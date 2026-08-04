import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { movePathWithCopyFallback } from './move-path-with-copy-fallback.mjs'

const temporaryRoots = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true })
  }
})

describe('movePathWithCopyFallback', () => {
  it('renames the tree when the destination shares a volume', () => {
    const { sourcePath, destinationPath } = createSourceTree()

    expect(movePathWithCopyFallback(sourcePath, destinationPath)).toBe('rename')

    expectMovedTree(destinationPath)
    expect(existsSync(sourcePath)).toBe(false)
  })

  it.each(['EACCES', 'EBUSY', 'EEXIST', 'ENOTEMPTY', 'EPERM', 'EXDEV'])(
    'copies the tree and removes the source when rename fails with %s',
    (code) => {
      const { sourcePath, destinationPath } = createSourceTree()

      expect(
        movePathWithCopyFallback(sourcePath, destinationPath, { rename: throwingRename(code) })
      ).toBe('copy')

      expectMovedTree(destinationPath)
      expect(existsSync(sourcePath)).toBe(false)
    }
  )

  it('copies a single file when rename fails with a recoverable code', () => {
    const { root, sourcePath } = createSourceTree()
    const destinationPath = join(root, 'electron.d.ts')

    movePathWithCopyFallback(join(sourcePath, 'version'), destinationPath, {
      rename: throwingRename('EPERM')
    })

    expect(readFileSync(destinationPath, 'utf8')).toBe('v41.5.0')
    expect(existsSync(join(sourcePath, 'version'))).toBe(false)
  })

  it('replaces a destination that survived the failed rename', () => {
    const { sourcePath, destinationPath } = createSourceTree()
    mkdirSync(destinationPath, { recursive: true })
    writeFileSync(join(destinationPath, 'stale.txt'), 'stale')

    movePathWithCopyFallback(sourcePath, destinationPath, { rename: throwingRename('ENOTEMPTY') })

    expectMovedTree(destinationPath)
    expect(existsSync(join(destinationPath, 'stale.txt'))).toBe(false)
  })

  it('rethrows rename failures that a copy cannot resolve', () => {
    const { sourcePath, destinationPath } = createSourceTree()

    expect(() =>
      movePathWithCopyFallback(sourcePath, destinationPath, { rename: throwingRename('ENOSPC') })
    ).toThrow(/ENOSPC/)

    expect(existsSync(destinationPath)).toBe(false)
    expect(readFileSync(join(sourcePath, 'version'), 'utf8')).toBe('v41.5.0')
  })
})

function createSourceTree() {
  const root = mkdtempSync(join(tmpdir(), 'orca-move-path-with-copy-fallback-'))
  temporaryRoots.push(root)

  const sourcePath = join(root, 'source')
  mkdirSync(join(sourcePath, 'nested'), { recursive: true })
  writeFileSync(join(sourcePath, 'version'), 'v41.5.0')
  writeFileSync(join(sourcePath, 'nested', 'framework'), 'binary')
  if (process.platform !== 'win32') {
    symlinkSync('version', join(sourcePath, 'version-link'))
  }

  return { root, sourcePath, destinationPath: join(root, 'destination') }
}

function throwingRename(code) {
  return () => {
    throw Object.assign(new Error(`rename failed with ${code}`), { code })
  }
}

function expectMovedTree(destinationPath) {
  expect(readFileSync(join(destinationPath, 'version'), 'utf8')).toBe('v41.5.0')
  expect(readFileSync(join(destinationPath, 'nested', 'framework'), 'utf8')).toBe('binary')
  if (process.platform !== 'win32') {
    const linkPath = join(destinationPath, 'version-link')
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(linkPath)).toBe('version')
  }
}
