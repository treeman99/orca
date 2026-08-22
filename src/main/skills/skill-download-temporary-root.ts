// Split out of skill-package-download.ts: that file sat on the 300-line cap, and the sharing
// removal guard needed the room. Owns the per-process download root and reaps roots whose
// owning process is gone.
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const PROCESS_DOWNLOAD_ROOT_PREFIX = '.orca-skill-download-process-'
const processDownloadRootName = `${PROCESS_DOWNLOAD_ROOT_PREFIX}${process.pid}-${randomUUID()}`
const initializedTemporaryRoots = new Map<string, Promise<string>>()

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

export async function prepareTemporaryRoot(path: string): Promise<string> {
  let initialization = initializedTemporaryRoots.get(path)
  if (!initialization) {
    initialization = (async () => {
      await mkdir(path, { recursive: true, mode: 0o700 })
      if (process.platform !== 'win32') {
        await chmod(path, 0o700)
      }
      const entries = await readdir(path, { withFileTypes: true })
      await Promise.all(
        entries.map(async (entry) => {
          const match = entry.isDirectory()
            ? entry.name.match(/^\.orca-skill-download-process-(\d+)-/)
            : null
          const pid = Number(match?.[1])
          if (match && Number.isSafeInteger(pid) && !processIsAlive(pid)) {
            await rm(join(path, entry.name), { recursive: true, force: true })
          }
        })
      )
      const processRoot = join(path, processDownloadRootName)
      await mkdir(processRoot, { recursive: true, mode: 0o700 })
      return processRoot
    })()
    initializedTemporaryRoots.set(path, initialization)
  }
  try {
    return await initialization
  } catch (error) {
    if (initializedTemporaryRoots.get(path) === initialization) {
      initializedTemporaryRoots.delete(path)
    }
    throw error
  }
}
