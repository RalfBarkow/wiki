import { blocks, run, api, tree, format, emit, bind } from './upstream-entry.mjs'
import { installDiscourse } from './discourse.mjs'
const originals = Object.fromEntries(Object.entries(blocks).map(([name, block]) => [name, block.emit]))
const installation = installDiscourse(blocks)
export { blocks, run, api, tree, format, emit, bind, originals, installation, installDiscourse }
