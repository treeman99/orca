import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, posix, resolve, sep } from 'node:path'
import { transform } from 'esbuild'

const rendererOutput = resolve('out/renderer')
const webOutput = resolve('out/web')
const stagingOutput = resolve(dirname(webOutput), `.web-projection-${process.pid}`)
const manifestPath = join(rendererOutput, '.vite', 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const selectedFiles = new Set(['web-index.html'])
const visitedEntries = new Set()

function assertEntryIsolation() {
  const entryKeys = new Set(
    Object.entries(manifest)
      .filter(([, entry]) => entry?.isEntry === true)
      .map(([key]) => key)
  )

  for (const sourceEntry of entryKeys) {
    const visited = new Set()
    const pending = [sourceEntry]
    while (pending.length > 0) {
      const key = pending.pop()
      if (visited.has(key)) {
        continue
      }
      visited.add(key)
      const entry = manifest[key]
      if (!entry || typeof entry !== 'object') {
        throw new Error(`Renderer manifest is missing entry: ${key}`)
      }
      for (const dependency of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
        if (entryKeys.has(dependency) && dependency !== sourceEntry) {
          throw new Error(`Renderer entry ${sourceEntry} executes entry ${dependency}`)
        }
        pending.push(dependency)
      }
    }
  }
}

function addOutputPath(outputPath) {
  if (
    typeof outputPath !== 'string' ||
    outputPath.length === 0 ||
    outputPath.startsWith('/') ||
    /^[A-Za-z]:/.test(outputPath) ||
    outputPath.includes('\\') ||
    outputPath.split('/').includes('..')
  ) {
    throw new Error(`Invalid renderer output path: ${String(outputPath)}`)
  }
  selectedFiles.add(outputPath)
}

function visitManifestEntry(key) {
  if (visitedEntries.has(key)) {
    return
  }
  visitedEntries.add(key)

  const entry = manifest[key]
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Renderer manifest is missing entry: ${key}`)
  }

  addOutputPath(entry.file)
  for (const outputPath of [...(entry.css ?? []), ...(entry.assets ?? [])]) {
    addOutputPath(outputPath)
  }
  for (const dependency of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
    visitManifestEntry(dependency)
  }
}

function listOutputFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const outputPath = prefix ? join(prefix, entry.name) : entry.name
    return entry.isDirectory()
      ? listOutputFiles(join(directory, entry.name), outputPath)
      : [outputPath.split(sep).join('/')]
  })
}

function includeReferencedOutputs() {
  const candidates = listOutputFiles(rendererOutput).filter(
    (outputPath) => !outputPath.startsWith('.vite/') && !outputPath.endsWith('.html')
  )
  let foundReference = true

  while (foundReference) {
    foundReference = false
    for (const selectedFile of selectedFiles) {
      if (!/\.(?:css|html|m?js|svg)$/.test(selectedFile)) {
        continue
      }
      const contents = readFileSync(join(rendererOutput, selectedFile), 'utf8')
      for (const candidate of candidates) {
        if (selectedFiles.has(candidate)) {
          continue
        }
        const localReference = posix.relative(posix.dirname(selectedFile), candidate)
        if (contents.includes(candidate) || contents.includes(localReference)) {
          selectedFiles.add(candidate)
          foundReference = true
        }
      }
    }
  }
}

// Why: Windows reports a filter driver's hold as any of these, and UNKNOWN covers the
// lock violations libuv leaves untranslated.
const lockedPathErrorCodes = new Set([
  'EACCES',
  'EBUSY',
  'EEXIST',
  'EMFILE',
  'ENFILE',
  'ENOTEMPTY',
  'EPERM',
  'UNKNOWN'
])

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

// Why: an antivirus scan holds a just-written file for seconds and neither Node primitive
// waits it out — rmSync divides retryDelay by 1000 before Sleep() on Windows, cpSync has
// no retry at all.
function withFsRetry(operation, { attempts = 8, delayMs = 200 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return operation()
    } catch (error) {
      if (attempt >= attempts || !lockedPathErrorCodes.has(error?.code)) {
        throw error
      }
      sleepSync(attempt * delayMs)
    }
  }
}

async function minifyWebOutput() {
  await Promise.all(
    [...selectedFiles]
      .filter((outputPath) => /\.(?:css|m?js)$/.test(outputPath))
      .map(async (outputPath) => {
        const targetPath = join(stagingOutput, outputPath)
        const loader = outputPath.endsWith('.css') ? 'css' : 'js'
        const result = await transform(
          withFsRetry(() => readFileSync(targetPath, 'utf8')),
          {
            legalComments: 'none',
            loader,
            minify: true,
            target: 'es2020'
          }
        )
        withFsRetry(() => writeFileSync(targetPath, result.code))
      })
  )
}

// Why: renaming the staged tree into place is what fails on locked-down Windows. Copying
// file by file also keeps every call on libuv's copyfile path, where a lock surfaces as a
// retryable errno instead of the Win32 code std::filesystem leaks through cpSync.
function publishWebOutput() {
  try {
    for (const outputPath of selectedFiles) {
      const targetPath = join(webOutput, outputPath)
      mkdirSync(dirname(targetPath), { recursive: true })
      withFsRetry(() => copyFileSync(join(stagingOutput, outputPath), targetPath))
    }
  } catch (error) {
    // Why: a torn out/web keeps a fresh web-index.html, and every freshness check keys on
    // that file — absent is the only state the consumers already handle.
    try {
      withFsRetry(() => rmSync(webOutput, { force: true, recursive: true }))
    } catch (cleanupError) {
      console.warn(`Could not remove the partial ${webOutput}: ${cleanupError?.message}`)
    }
    throw error
  }
}

assertEntryIsolation()
visitManifestEntry('web-index.html')
includeReferencedOutputs()

withFsRetry(() => rmSync(stagingOutput, { force: true, recursive: true }))
try {
  for (const outputPath of selectedFiles) {
    const targetPath = join(stagingOutput, outputPath)
    mkdirSync(dirname(targetPath), { recursive: true })
    withFsRetry(() => cpSync(join(rendererOutput, outputPath), targetPath))
  }
  await minifyWebOutput()

  withFsRetry(() => rmSync(webOutput, { force: true, recursive: true }))
  publishWebOutput()
} finally {
  withFsRetry(() => rmSync(stagingOutput, { force: true, recursive: true }))
}

const outputBytes = [...selectedFiles].reduce(
  (total, outputPath) => total + statSync(join(webOutput, outputPath)).size,
  0
)
console.log(
  `Projected web client: ${selectedFiles.size} files, ${(outputBytes / 1024 / 1024).toFixed(1)} MiB`
)
