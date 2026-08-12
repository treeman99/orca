const { readFileSync, readdirSync, statSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { join } = require('node:path')

const PREFIX = '[verify-packaged-skill-packages]'
// Why: electron-builder only logs `file source doesn't exist` and keeps going when an
// extraResources entry is missing. For this fork that warning would ship an installer whose
// skill install has nothing to copy — and the only remaining path is the npx/GitHub one a
// locked-down network cannot reach. Assert the real output instead.
const REMEDY = 'Skill installs copy these bytes; without them the app has no offline install path.'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function collectFiles(root, relative = '') {
  const files = []
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const entryPath = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...collectFiles(root, entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

/**
 * Assert the packaged skill packages exist and match the freshness manifest beside them.
 *
 * The two ship from one resource root on purpose: an install writes the package bytes and
 * records the manifest's tree sha as what it wrote. If they disagree, every install reports
 * itself as unrecognized content the moment it lands.
 */
function verifyPackagedSkillPackages(resourcesDir) {
  const manifestPath = join(resourcesDir, 'skills', 'current-manifest.json')
  const packagesDir = join(resourcesDir, 'skills', 'packages')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`${PREFIX} missing or unreadable manifest at ${manifestPath}: ${error.message}`)
  }
  if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) {
    throw new Error(`${PREFIX} ${manifestPath} lists no skills`)
  }
  try {
    if (!statSync(packagesDir).isDirectory()) {
      throw new Error('not a directory')
    }
  } catch {
    throw new Error(`${PREFIX} missing packaged skill packages at ${packagesDir}. ${REMEDY}`)
  }

  for (const skill of manifest.skills) {
    const packageDir = join(packagesDir, skill.name)
    let packagedFiles
    try {
      packagedFiles = collectFiles(packageDir).sort()
    } catch {
      throw new Error(`${PREFIX} manifest lists "${skill.name}" but ${packageDir} is absent`)
    }
    const expected = skill.files.map((file) => file.path).sort()
    if (JSON.stringify(packagedFiles) !== JSON.stringify(expected)) {
      throw new Error(
        `${PREFIX} "${skill.name}" packaged files do not match the manifest.\n` +
          `Expected: ${expected.join(', ')}\nFound: ${packagedFiles.join(', ')}`
      )
    }
    for (const file of skill.files) {
      const bytes = readFileSync(join(packageDir, ...file.path.split('/')))
      if (sha256(bytes) !== file.exactSha256) {
        throw new Error(
          `${PREFIX} "${skill.name}/${file.path}" does not match the manifest hash. ` +
            'Run pnpm generate:skill-bundle-manifest.'
        )
      }
    }
  }
}

module.exports = { verifyPackagedSkillPackages }
