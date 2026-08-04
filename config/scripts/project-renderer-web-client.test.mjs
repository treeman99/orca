import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve('config/scripts/project-renderer-web-client.mjs')
const temporaryRoots = []

function writeFixtureFile(root, relativePath, contents) {
  const targetPath = join(root, relativePath)
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, contents)
}

// Why: --require runs before the ESM graph loads, and syncBuiltinESMExports pushes the
// patch into the script's `import { … } from 'node:fs'` bindings.
function writeFsHook(root, name, lines) {
  writeFixtureFile(
    root,
    name,
    [
      "const fs = require('node:fs')",
      ...lines,
      "require('node:module').syncBuiltinESMExports()"
    ].join('\n')
  )
}

function createRendererFixture() {
  const root = mkdtempSync(join(tmpdir(), 'orca-web-projection-'))
  temporaryRoots.push(root)
  const manifest = {
    'web-index.html': {
      file: 'assets/web-entry.js',
      isEntry: true,
      imports: ['_web-shared.js'],
      dynamicImports: ['src/lazy.ts']
    },
    '_web-shared.js': {
      file: 'assets/web-shared.js',
      css: ['assets/web.css'],
      assets: ['assets/logo.png']
    },
    'src/lazy.ts': { file: 'assets/lazy.js' },
    'index.html': { file: 'assets/desktop-entry.js', isEntry: true }
  }

  writeFixtureFile(root, 'out/renderer/.vite/manifest.json', JSON.stringify(manifest))
  writeFixtureFile(
    root,
    'out/renderer/web-index.html',
    '<script type="module" src="./assets/web-entry.js"></script>'
  )
  writeFixtureFile(
    root,
    'out/renderer/assets/web-entry.js',
    'import "./web-shared.js"; new Worker(new URL("editor.worker-fixture.js", import.meta.url));'
  )
  writeFixtureFile(root, 'out/renderer/assets/web-shared.js', 'export const value = 1;')
  writeFixtureFile(root, 'out/renderer/assets/lazy.js', 'export const lazyValue = true;')
  writeFixtureFile(root, 'out/renderer/assets/web.css', '.root { color: red; }')
  writeFixtureFile(root, 'out/renderer/assets/logo.png', 'fixture-logo')
  writeFixtureFile(
    root,
    'out/renderer/assets/editor.worker-fixture.js',
    'self.onmessage = function (event) { self.postMessage(event.data) }'
  )
  writeFixtureFile(root, 'out/renderer/assets/desktop-entry.js', 'export const desktop = true;')
  writeFixtureFile(root, 'out/web/stale.js', 'stale')
  return root
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true })
  }
})

describe('renderer web client projection', () => {
  it('keeps the build-only manifest out of packaged apps', () => {
    const builderConfig = readFileSync(resolve('config/electron-builder.config.cjs'), 'utf8')

    expect(builderConfig).toContain("'!out/renderer/.vite{,/**/*}'")
  })

  it('copies and minifies only the web dependency closure', () => {
    const root = createRendererFixture()
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8'
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Projected web client: 7 files')
    expect(existsSync(join(root, 'out/web/web-index.html'))).toBe(true)
    expect(existsSync(join(root, 'out/web/assets/editor.worker-fixture.js'))).toBe(true)
    expect(existsSync(join(root, 'out/web/assets/logo.png'))).toBe(true)
    expect(existsSync(join(root, 'out/web/assets/desktop-entry.js'))).toBe(false)
    expect(existsSync(join(root, 'out/web/stale.js'))).toBe(false)
    expect(readFileSync(join(root, 'out/web/assets/web.css'), 'utf8')).toBe('.root{color:red}\n')
  })

  it('never renames the projected tree into place', () => {
    const root = createRendererFixture()
    writeFsHook(root, 'poison-rename.cjs', [
      'fs.renameSync = () => {',
      "  throw new Error('FS_RENAME_CALLED')",
      '}'
    ])
    const hook = ['--require', join(root, 'poison-rename.cjs')]

    // Why: without this control the test would also pass when the hook stops reaching the
    // script's ESM `import { … } from 'node:fs'` bindings.
    const control = spawnSync(
      process.execPath,
      [
        ...hook,
        '--input-type=module',
        '-e',
        "import { renameSync } from 'node:fs'\nrenameSync('a', 'b')"
      ],
      { cwd: root, encoding: 'utf8' }
    )
    expect(control.stderr).toContain('FS_RENAME_CALLED')

    const result = spawnSync(process.execPath, [...hook, scriptPath], {
      cwd: root,
      encoding: 'utf8'
    })

    expect(result.stderr).not.toContain('FS_RENAME_CALLED')
    expect(result.status, result.stderr).toBe(0)
    expect(existsSync(join(root, 'out/web/web-index.html'))).toBe(true)
  })

  it('retries a locked destination removal instead of failing the build', () => {
    const root = createRendererFixture()
    writeFsHook(root, 'flaky-rm.cjs', [
      'const realRmSync = fs.rmSync',
      'let failures = 3',
      'fs.rmSync = (target, options) => {',
      "  if (!String(target).endsWith('web') || failures === 0) {",
      '    return realRmSync(target, options)',
      '  }',
      '  failures -= 1',
      "  process.stderr.write('RM_ATTEMPT\\n')",
      "  const error = new Error('EBUSY: resource busy or locked')",
      "  error.code = 'EBUSY'",
      '  throw error',
      '}'
    ])

    const result = spawnSync(
      process.execPath,
      ['--require', join(root, 'flaky-rm.cjs'), scriptPath],
      { cwd: root, encoding: 'utf8' }
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr.split('RM_ATTEMPT').length - 1).toBe(3)
    expect(existsSync(join(root, 'out/web/stale.js'))).toBe(false)
  })

  it('removes out/web instead of leaving it torn when publishing fails', () => {
    const root = createRendererFixture()
    writeFsHook(root, 'poison-copy.cjs', [
      "const { sep } = require('node:path')",
      'const realCopyFileSync = fs.copyFileSync',
      'fs.copyFileSync = (source, destination) => {',
      // Only the publish step writes under out/web; staging goes to .web-projection-<pid>.
      "  if (String(destination).includes(sep + 'web' + sep) && String(destination).endsWith('logo.png')) {",
      "    const error = new Error('EROFS: read-only file system')",
      "    error.code = 'EROFS'",
      '    throw error',
      '  }',
      '  return realCopyFileSync(source, destination)',
      '}'
    ])

    const result = spawnSync(
      process.execPath,
      ['--require', join(root, 'poison-copy.cjs'), scriptPath],
      { cwd: root, encoding: 'utf8' }
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('EROFS')
    expect(existsSync(join(root, 'out/web'))).toBe(false)
  })

  it('fails when the renderer manifest omits the web entry', () => {
    const root = createRendererFixture()
    writeFixtureFile(root, 'out/renderer/.vite/manifest.json', '{}')
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Renderer manifest is missing entry: web-index.html')
  })

  it('rejects renderer entries that execute another entry root', () => {
    const root = createRendererFixture()
    const manifestPath = join(root, 'out/renderer/.vite/manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest['web-index.html'].dynamicImports.push('index.html')
    writeFileSync(manifestPath, JSON.stringify(manifest))

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Renderer entry web-index.html executes entry index.html')
  })
})
