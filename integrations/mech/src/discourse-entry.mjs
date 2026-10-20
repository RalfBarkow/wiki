import { blocks, run, api, tree, format, emit, bind } from './upstream-entry.mjs'
import { installDiscourse } from './discourse.mjs'
import { installDiscourseTraverse, resolveEdges, traverse, presentGraph } from './discourse-traverse.mjs'
const originals = Object.fromEntries(Object.entries(blocks).map(([name, block]) => [name, block.emit]))
const installation = installDiscourse(blocks)
const traversal = installDiscourseTraverse(blocks)
export { blocks, run, api, tree, format, emit, bind, originals, installation, installDiscourse }
export { traversal, installDiscourseTraverse, resolveEdges, traverse, presentGraph }
