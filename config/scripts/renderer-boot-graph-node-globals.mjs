import fs from 'node:fs'
import path from 'node:path'

import { parseAst } from 'vite'

// The main window's renderer is sandboxed with context isolation, so none of
// these exist in its page world. A read while a boot chunk evaluates throws a
// ReferenceError that stops the whole ESM graph before main.tsx runs: no React
// root, no crash breadcrumb, just a blank window (v1.4.223–224). Unit tests run
// on Node, where all of them exist, so only the built graph can show it.
const NODE_ONLY_GLOBALS = new Set([
  'process',
  'Buffer',
  'global',
  'require',
  '__dirname',
  '__filename'
])

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression'
])

function collectModuleScopeNames(program) {
  const names = new Set()
  const addPattern = (pattern) => {
    if (!pattern) {
      return
    }
    switch (pattern.type) {
      case 'Identifier':
        names.add(pattern.name)
        break
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          addPattern(property.type === 'RestElement' ? property.argument : property.value)
        }
        break
      case 'ArrayPattern':
        pattern.elements.forEach(addPattern)
        break
      case 'RestElement':
        addPattern(pattern.argument)
        break
      case 'AssignmentPattern':
        addPattern(pattern.left)
        break
    }
  }
  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (!declaration) {
      continue
    }
    if (declaration.type === 'VariableDeclaration') {
      declaration.declarations.forEach((declarator) => addPattern(declarator.id))
    } else if (
      declaration.type === 'FunctionDeclaration' ||
      declaration.type === 'ClassDeclaration'
    ) {
      addPattern(declaration.id)
    } else if (declaration.type === 'ImportDeclaration') {
      declaration.specifiers.forEach((specifier) => addPattern(specifier.local))
    }
  }
  return names
}

function forEachChild(node, callback) {
  for (const [key, child] of Object.entries(node)) {
    if (Array.isArray(child)) {
      child.forEach((item) => callback(item, key))
    } else if (child && typeof child === 'object') {
      callback(child, key)
    }
  }
}

/** Names a `typeof name` probe inside `node` checks, so the branch it gates may read them. */
function typeofProbedNames(node, names = new Set()) {
  if (!node || typeof node.type !== 'string' || FUNCTION_TYPES.has(node.type)) {
    return names
  }
  if (node.type === 'UnaryExpression' && node.operator === 'typeof') {
    if (node.argument.type === 'Identifier') {
      names.add(node.argument.name)
    }
    return names
  }
  forEachChild(node, (child) => typeofProbedNames(child, names))
  return names
}

/**
 * Node-only globals read while a module evaluates. Function bodies, default
 * parameters, and instance field initializers run later, on a call, so they
 * are skipped, as is any read gated by a `typeof` probe of the same name
 * (`typeof process < 'u' && process.platform`).
 */
export function findModuleScopeNodeGlobalReads(code) {
  const program = parseAst(code)
  const shadowed = collectModuleScopeNames(program)
  const reads = []
  const visit = (node, parent, key, guarded) => {
    if (!node || typeof node.type !== 'string' || FUNCTION_TYPES.has(node.type)) {
      return
    }
    if (node.type === 'PropertyDefinition' && !node.static) {
      visit(node.key, node, 'key', guarded)
      return
    }
    if (
      node.type === 'UnaryExpression' &&
      node.operator === 'typeof' &&
      node.argument.type === 'Identifier'
    ) {
      return
    }
    if (node.type === 'LogicalExpression') {
      visit(node.left, node, 'left', guarded)
      visit(node.right, node, 'right', new Set([...guarded, ...typeofProbedNames(node.left)]))
      return
    }
    if (node.type === 'ConditionalExpression' || node.type === 'IfStatement') {
      visit(node.test, node, 'test', guarded)
      const branchGuard = new Set([...guarded, ...typeofProbedNames(node.test)])
      visit(node.consequent, node, 'consequent', branchGuard)
      visit(node.alternate, node, 'alternate', branchGuard)
      return
    }
    if (
      node.type === 'Identifier' &&
      NODE_ONLY_GLOBALS.has(node.name) &&
      !shadowed.has(node.name) &&
      !guarded.has(node.name) &&
      !isNonReferenceIdentifier(parent, key)
    ) {
      reads.push({ name: node.name, start: node.start })
      return
    }
    forEachChild(node, (child, childKey) => visit(child, node, childKey, guarded))
  }
  visit(program, null, null, new Set())
  return reads
}

function isNonReferenceIdentifier(parent, key) {
  if (!parent) {
    return false
  }
  // `x.process`, `{ process: 1 }`, `class { process() {} }`, labels.
  if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) {
    return true
  }
  if (
    (parent.type === 'Property' ||
      parent.type === 'MethodDefinition' ||
      parent.type === 'PropertyDefinition') &&
    key === 'key' &&
    !parent.computed
  ) {
    return true
  }
  if (
    (parent.type === 'ExportSpecifier' && key === 'exported') ||
    (parent.type === 'ImportSpecifier' && key === 'imported')
  ) {
    return true
  }
  return (
    parent.type === 'LabeledStatement' ||
    parent.type === 'BreakStatement' ||
    parent.type === 'ContinueStatement'
  )
}

/** `chunks` is `readRendererBootGraph(...).chunks`. */
export function findBootGraphNodeGlobalReads(chunks) {
  const violations = []
  for (const chunk of chunks) {
    const code = fs.readFileSync(chunk.file, 'utf8')
    for (const read of findModuleScopeNodeGlobalReads(code)) {
      violations.push({
        chunk: path.basename(chunk.file),
        name: read.name,
        excerpt: code.slice(Math.max(0, read.start - 60), read.start + 60)
      })
    }
  }
  return violations
}

export function verifyRendererBootGraphNodeGlobals(chunks) {
  const violations = findBootGraphNodeGlobalReads(chunks)
  if (violations.length === 0) {
    return 0
  }
  console.error('The sandboxed renderer reads Node-only globals while its boot graph evaluates:')
  for (const violation of violations) {
    console.error(`  ${violation.name} -> ${violation.chunk}: …${violation.excerpt}…`)
  }
  console.error('')
  console.error(
    'Each one throws before first paint and leaves a blank window. Move the read into a function, ' +
      'guard it with `typeof`, or keep the module main-only (src/main, not src/shared).'
  )
  return 1
}
