import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { RENDERER_BUILD_DIR, readRendererBootGraph } from './renderer-boot-graph.mjs'
import {
  findBootGraphNodeGlobalReads,
  findModuleScopeNodeGlobalReads
} from './renderer-boot-graph-node-globals.mjs'

const names = (code) => findModuleScopeNodeGlobalReads(code).map((read) => read.name)

describe('module-scope Node global reads', () => {
  it('flags the bare statement tree-shaking leaves behind an unused constant', () => {
    // The exact v1.4.223–224 shape: the declaration is dropped, the global read is kept.
    expect(names('function a(){}process.platform;var b=8e3;')).toEqual(['process'])
  })

  it('flags reads in a used module-scope initializer', () => {
    expect(names("export const D = process.platform === 'win32' ? 1500 : 500")).toEqual(['process'])
    expect(names('const b = Buffer.alloc(1)')).toEqual(['Buffer'])
    expect(names('const r = require("x")')).toEqual(['require'])
  })

  it('flags static class members, which run while the module evaluates', () => {
    expect(names('class A { static p = process.env }')).toEqual(['process'])
    expect(names('class A { static { global.x = 1 } }')).toEqual(['global'])
  })

  it('ignores reads that only run on a later call', () => {
    expect(names('function f(){ return process.platform }')).toEqual([])
    expect(names('const f = () => process.platform')).toEqual([])
    expect(names('function f(p = process.platform){ return p }')).toEqual([])
    expect(names('class A { p = process.env; m(){ return Buffer } }')).toEqual([])
  })

  it('ignores reads gated by a typeof probe of the same global', () => {
    expect(names('typeof process<`u`&&process.platform;')).toEqual([])
    expect(names("var v=typeof process!=='undefined'?process.env:{}")).toEqual([])
    expect(names('typeof process>`u`||process.exit()')).toEqual([])
    expect(names("if (typeof process !== 'undefined') { process.on('x', y) }")).toEqual([])
    expect(
      names('typeof process<`u`&&typeof process?.versions?.node==`string`&&(v=process)')
    ).toEqual([])
  })

  it('does not let a probe of one global cover another', () => {
    expect(names('typeof window<`u`&&process.platform;')).toEqual(['process'])
  })

  it('ignores names that are not references to the global', () => {
    expect(names('a.process; b={process:1}; class C { process(){} }')).toEqual([])
    expect(names('var process = {platform: "x"}; process.platform;')).toEqual([])
    expect(names('const x = 1; export { x as process }')).toEqual([])
  })
})

const rendererDir = path.join(process.cwd(), RENDERER_BUILD_DIR)
const built = fs.existsSync(path.join(rendererDir, 'index.html'))

// Requires `pnpm run build:electron-vite`; the same check runs unconditionally
// at the end of that build, so CI can never skip it.
it.runIf(built)('the built renderer boot graph reads no Node-only global while evaluating', () => {
  expect(findBootGraphNodeGlobalReads(readRendererBootGraph(rendererDir).chunks)).toEqual([])
})
