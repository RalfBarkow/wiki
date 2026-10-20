// TRAVERSE: follows explicitly typed Discourse relations (question/claim/support/oppose) from the page
// that holds the block. Available only in the discourse profile; Ward's WALK and the role WALK of
// discourse.mjs are not touched.
//
// Read   -> existing EXTRACT (state.discourse.edges); its edges name the target as `site+slug` and do not
//           record whether the site was written in the page or taken from the page that contains the link.
// Resolve-> resolveEdges: the declared site is never replaced; a target not listed in that site's sitemap
//           stays unresolved, other sites that list the slug are shown as candidates and never chosen.
// Traverse-> traverse: breadth-first over the listed roles, from the roots.
// Present-> presentGraph: upstream Graph handed on through state.aspect, as WALK does.
import { Graph } from 'mech-upstream/src/client/graph/graph.js'

export const ROLES = ['question', 'claim', 'support', 'oppose']
const PLURALS = { questions: 'question', claims: 'claim', supports: 'support', opposes: 'oppose' }
export const DEFAULT_DEPTH = 4
export const REASON_NOT_FOUND = 'not-found-at-declared-site'

const splitId = id => {
  const at = id.indexOf('+')
  return { site: id.slice(0, at), slug: id.slice(at + 1) }
}
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// Edges of the Read step -> edges whose endpoints are resolved or visibly unresolved.
export function resolveEdges(edges, neighborhood) {
  const listed = new Map(neighborhood.map(info => [`${info.domain}+${info.slug}`, info]))
  const candidatesFor = (slug, declaredSite) =>
    [...new Set(neighborhood.filter(info => info.slug == slug && info.domain != declaredSite).map(info => info.domain))].sort()
  const end = id => {
    const { site, slug } = splitId(id)
    const info = listed.get(id)
    return info
      ? { status: 'resolved', declaredSite: site, slug, title: info.title }
      : { status: 'unresolved', declaredSite: site, slug, reason: REASON_NOT_FOUND, candidates: candidatesFor(slug, site) }
  }
  return edges.map(edge => ({ ...edge, from: end(edge.fromId), target: end(edge.toId) }))
}

// Breadth-first from the roots over edges whose role is listed. A resolved target is expanded once;
// an unresolved target is a leaf. Identical edges are reported once, with their count.
export function traverse(resolved, roots, roles, depth = DEFAULT_DEPTH) {
  const wanted = new Set(roles)
  const outgoing = new Map()
  for (const edge of resolved) {
    if (!wanted.has(edge.role)) continue
    if (!outgoing.has(edge.fromId)) outgoing.set(edge.fromId, [])
    outgoing.get(edge.fromId).push(edge)
  }
  const seen = new Set(roots)
  const reached = new Map()
  let frontier = [...roots].sort()
  for (let level = 0; level < depth && frontier.length; level++) {
    const next = []
    for (const id of frontier) {
      const edges = (outgoing.get(id) || []).slice().sort(
        (a, b) => compare(a.role, b.role) || compare(a.toId, b.toId),
      )
      for (const edge of edges) {
        const key = `${edge.fromId}\u0000${edge.role}\u0000${edge.toId}`
        if (reached.has(key)) reached.get(key).count++
        else reached.set(key, { ...edge, count: 1 })
        if (edge.target.status == 'resolved' && !seen.has(edge.toId)) {
          seen.add(edge.toId)
          next.push(edge.toId)
        }
      }
    }
    frontier = next
  }
  return [...reached.values()].sort(
    (a, b) => compare(a.fromId, b.fromId) || compare(a.role, b.role) || compare(a.toId, b.toId),
  )
}

// Solo merges nodes by (type, props.name) and navigates by props.site and props.title.
// Name: site/slug, so pages are distinct by site and slug whatever their titles.
export function presentGraph(traversed) {
  const graph = new Graph()
  const page = (end, id) =>
    end.status == 'resolved'
      ? graph.addUniqNode('WikiPage', {
          name: `${end.declaredSite}/${end.slug}`,
          site: end.declaredSite,
          slug: end.slug,
          title: end.title,
          id,
        })
      : graph.addUniqNode('UnresolvedLink', {
          name: `${end.declaredSite}/${end.slug}`,
          declaredSite: end.declaredSite,
          slug: end.slug,
          candidates: end.candidates,
          reason: end.reason,
        })
  for (const edge of traversed) {
    const from = page(edge.from, edge.fromId)
    const to = page(edge.target, edge.toId)
    graph.addRel(edge.role, from, to, {
      fold: edge.source?.fold,
      declaredOn: edge.fromId,
      extractorVersion: edge.source?.extractorVersion,
    })
  }
  return graph
}

export function parseRoles(args) {
  const roles = []
  for (const arg of args || []) {
    const role = PLURALS[arg.toLowerCase()] || arg.toLowerCase()
    if (!ROLES.includes(role)) return { error: `TRAVERSE expects roles from ${ROLES.join(', ')}; got "${arg}".` }
    if (!roles.includes(role)) roles.push(role)
  }
  return { roles: roles.length ? roles : ROLES.slice() }
}

function rootOf(state, elem) {
  const key = state.api.thisLineupKey(elem)
  const pageObject = state.api.lineupAtKey(key)
  // location.host, as discourse.mjs does: upstream's api.host() has no return statement and yields undefined.
  return `${pageObject.getRemoteSite(location.host)}+${pageObject.getSlug()}`
}

function traverse_emit({ elem, command, args, state }) {
  if (!state.neighborhood) return state.api.trouble(elem, `TRAVERSE requires NEIGHBORS first`)
  if (!state.discourse || !Array.isArray(state.discourse.edges))
    return state.api.trouble(elem, `TRAVERSE requires EXTRACT first`)
  const { roles, error } = parseRoles(args)
  if (error) return state.api.trouble(elem, error)
  const root = rootOf(state, elem)
  const resolved = resolveEdges(state.discourse.edges, state.neighborhood)
  const traversed = traverse(resolved, [root], roles)
  state.traversal = { root, roles, depth: DEFAULT_DEPTH, edges: traversed }
  if (!traversed.length) return state.api.trouble(elem, `TRAVERSE found no ${roles.join('/')} relations from ${root}`)
  const graph = presentGraph(traversed)
  const unresolved = graph.nodes.filter(node => node.type == 'UnresolvedLink').length
  state.api.status(
    elem,
    command,
    ` ⇒ ${traversed.length} relations, ${graph.nodes.length} nodes, ${unresolved} unresolved`,
  )
  const result = [{ name: `TRAVERSE ${roles.join(' ')}`, graph }]
  state.aspect = state.aspect || []
  const obj = state.aspect.find(each => each.id == elem.id)
  if (obj) obj.result = result
  else state.aspect.push({ id: elem.id, result, source: command })
  state.api.publishSourceData(elem, 'aspect', state.aspect.map(each => each.result).flat())
}

const installed = new WeakSet()
export function installDiscourseTraverse(catalog) {
  if (!catalog || typeof catalog !== 'object') throw new Error('Incompatible catalog')
  if (installed.has(catalog)) throw new Error('Already installed')
  if ('TRAVERSE' in catalog) throw new Error('Command collision: TRAVERSE')
  if (typeof catalog.EXTRACT?.emit !== 'function') throw new Error('Incompatible catalog: TRAVERSE requires EXTRACT')
  if (!Object.isExtensible(catalog)) throw new Error('Nonextensible catalog')
  catalog.TRAVERSE = { emit: traverse_emit }
  installed.add(catalog)
  return { added: ['TRAVERSE'] }
}
