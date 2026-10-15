// Fork-owned: afterPack asserts the bundled enterprise policy and the offline skill packages, so a
// packaged-layout fixture must carry them exactly where extraResources places them.
import { cp } from 'node:fs/promises'
import { join } from 'node:path'

export async function seedPackagedEnterpriseResources(resourcesDir) {
  const root = process.cwd()
  const policy = join('resources', 'enterprise-policy.json')
  await cp(join(root, policy), join(resourcesDir, 'enterprise-policy.json'))
  await cp(join(root, 'resources', 'skills'), join(resourcesDir, 'skills'), { recursive: true })
  await cp(join(root, 'skills'), join(resourcesDir, 'skills', 'packages'), { recursive: true })
}
