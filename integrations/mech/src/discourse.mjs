// Wiki-owned Discourse extension, ported from abd88d2; see sources.json and README.md.
import { asSlug } from 'mech-upstream/src/client/mech.js'
import { Graph } from 'mech-upstream/src/client/graph/graph.js'
function expand(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Text-node escaping is separate from quoted-attribute escaping and URL validation.
function attribute(text) {
  return expand(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function validSiteAuthority(site) {
  if (typeof site !== 'string' || !site || /[\s/\\?#@%+"'<>`]/u.test(site)) return false
  // Wiki sites are location.host-style authorities, not URLs or userinfo.
  const match = site.match(/^(\[[^\]]+\]|[^:]+)(?::([0-9]+))?$/u)
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return false
  try {
    const url = new URL('https://' + site + '/')
    if (url.username || url.password || url.pathname !== '/' || !url.hostname) return false
    if (match[1].startsWith('[')) return true // URL parsing validates IPv6 literals.
    // Preserve the authority identity instead of accepting alternate numeric-host spellings.
    // Otherwise use the browser's host grammar; do not add DNS or destination allowlists.
    if (/^[\x00-\x7f]+$/.test(match[1]) && url.hostname !== match[1].toLowerCase()) return false
    return true
  } catch {
    return false
  }
}

function normalize_fold(text) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
}

function canonicalize_fold(fold) {
  const map = {
    claims: 'claim',
    questions: 'question',
    supports: 'support',
    opposes: 'oppose',
  }
  return map[fold] || fold
}

function update_fold_stats(text, recognized, stats) {
  const normalized = normalize_fold(text)
  const canonical = canonicalize_fold(normalized)
  if (!canonical) return null
  stats.encountered[canonical] = (stats.encountered[canonical] || 0) + 1
  if (recognized.has(canonical)) return canonical
  stats.unknown[canonical] = (stats.unknown[canonical] || 0) + 1
  return null
}

function parse_extract_args(args) {
  for (const arg of args || []) {
    if (arg && arg.match(/^[1-9][0-9]*$/)) {
      const value = parseInt(arg, 10)
      if (Number.isInteger(value) && value > 0) return { limit: value }
    }
  }
  return { limit: null }
}

function parse_links(item, site) {
  const links = []
  if (item?.type == 'reference' && item.slug) {
    links.push({ site: item.site || site, slug: item.slug })
  }
  if (item?.type == 'paragraph' && typeof item.text == 'string') {
    let match
    const re = /\[\[([^\]]+)\]\]/g
    while ((match = re.exec(item.text)) !== null) {
      const target = match[1].split('|')[0].trim()
      if (!target || target.includes('://')) continue
      const [targetSite, rawSlug] = target.includes('/') ? target.split(/\//) : [site, target]
      const targetSlug = asSlug(rawSlug)
      if (!targetSlug) continue
      links.push({ site: targetSite || site, slug: targetSlug })
    }
  }
  return links
}

function extract_edges_from_story(story, pageId, recognized, foldStats) {
  const edges = []
  const edgesByRole = { question: 0, claim: 0, support: 0, oppose: 0 }
  const [site] = (pageId || '').split('+')
  const toId = (domain, slug) => `${domain}+${slug}`
  let role = null
  for (const item of story) {
    if (item.type == 'pagefold') {
      role = update_fold_stats(item.text, recognized, foldStats)
      continue
    }
    if (!role) continue
    for (const link of parse_links(item, site)) {
      if (!link.slug) continue
      edges.push({
        fromId: pageId,
        toId: toId(link.site, link.slug),
        role,
        source: {
          pageId,
          fold: role,
          extractorVersion: 'extract-fold-aware-v1',
        },
      })
      edgesByRole[role] += 1
    }
  }
  return { edges, edgesByRole }
}

async function extract_emit({ elem, command, args, state }) {
  if (!state.neighborhood) return state.api.trouble(elem, `EXTRACT requires NEIGHBORS first`)
  const { limit } = parse_extract_args(args)
  const pagesInScope = state.neighborhood.length
  let scope = state.neighborhood.slice().sort((a, b) => b.date - a.date)
  if (limit !== null) scope = scope.slice(0, limit)
  const pagesFetched = scope.length
  const recognized = new Set(['question', 'claim', 'support', 'oppose'])
  const toId = (site, slug) => `${site}+${slug}`

  const edges = []
  const edgesByRole = { question: 0, claim: 0, support: 0, oppose: 0 }
  const foldStats = { encountered: {}, unknown: {} }
  const unparsedPages = []
  let pagesParsed = 0
  let fetchFailures = 0
  let parseFailures = 0

  for (const info of scope) {
    const site = info.domain
    const slug = info.slug
    const pageId = toId(site, slug)
    let page
    try {
      const url = `//${site}/${slug}.json`
      page = await state.api.jfetch(url)
      if (!page) {
        fetchFailures++
        unparsedPages.push(pageId)
        continue
      }
    } catch (err) {
      fetchFailures++
      unparsedPages.push(pageId)
      continue
    }
    if (!page.story || !Array.isArray(page.story)) {
      parseFailures++
      unparsedPages.push(pageId)
      continue
    }
    pagesParsed++
    const extracted = extract_edges_from_story(page.story, pageId, recognized, foldStats)
    edges.push(...extracted.edges)
    for (const [role, count] of Object.entries(extracted.edgesByRole)) {
      edgesByRole[role] += count
    }
  }

  state.discourse = {
    identity: 'domain+slug',
    edges,
    metadata: {
      extractorVersion: 'extract-fold-aware-v1',
      timestamp: new Date().toISOString(),
      pagesInScope,
      pagesFetched,
      pagesParsed,
      fetchFailures,
      parseFailures,
      unparsedPages,
      edgesExtracted: edges.length,
      edgesByRole,
      foldsEncountered: foldStats.encountered,
      foldsUnknown: foldStats.unknown,
      note: limit === null ? 'fetch' : `fetch:${limit}`,
    },
  }
  const unknownTotal = Object.values(foldStats.unknown).reduce((sum, count) => sum + count, 0)
  const limitLabel = limit === null ? '' : ` (limit: ${limit})`
  state.api.status(
    elem,
    command,
    ` ⇒ parsed ${pagesParsed}/${pagesFetched} pages, ${edges.length} typed edges (claim: ${edgesByRole.claim}; unknown folds: ${unknownTotal})${limitLabel}`,
  )
}

function renderEdgesHtml(allEdges, args, pagesById, command = 'EDGES') {
  let limit = null
  let type = null
  for (const arg of args || []) {
    if (!arg) continue
    if (/^type:/i.test(arg)) {
      type = arg.split(':')[1]?.toLowerCase()
    } else if (arg.match(/^[1-9][0-9]*$/)) {
      const value = parseInt(arg, 10)
      if (Number.isInteger(value) && value > 0) limit = value
    } else {
      type = arg.toLowerCase()
    }
  }
  const norm = s => (s ?? '').toString().trim().toLowerCase()
  const foldFor = edge => norm(edge.role ?? edge.source?.fold) || 'unknown'
  const predicateFor = edge => norm(edge.type ?? edge.role) || ''
  const filteredEdges = type ? allEdges.filter(edge => predicateFor(edge) == norm(type)) : allEdges.slice()
  const visibleEdges = limit === null ? filteredEdges : filteredEdges.slice(0, limit)
  const allByFold = filteredEdges.reduce((acc, edge) => {
    const fold = foldFor(edge)
    acc[fold] ||= []
    acc[fold].push(edge)
    return acc
  }, {})
  const formatId = id => {
    if (!id) return ''
    if (typeof id !== 'string')
      return '<span class="invalid-destination">Invalid Wiki destination: expected page identity</span>'
    const parts = id.split('+')
    const hasSite = parts.length > 1
    const site = hasSite ? parts.shift() : null
    const slug = hasSite ? parts.join('+') : id
    const pageId = site ? `${site}+${slug}` : slug
    const title = pagesById?.[pageId]?.title
    const label = expand(String(title || slug))
    if (!slug || (hasSite && !validSiteAuthority(site)))
      return `<span class="invalid-destination" title="Invalid Wiki site authority or empty slug; navigation disabled">${label} (invalid destination)</span>`
    const href = site ? `//${site}/view/${encodeURIComponent(slug)}` : `/view/${encodeURIComponent(slug)}`
    return `<a href="${attribute(href)}">${label}</a>`
  }
  const visibleByFold = visibleEdges.reduce((acc, edge) => {
    const fold = foldFor(edge)
    acc[fold] ||= []
    acc[fold].push(edge)
    return acc
  }, {})
  const canonical = ['claim', 'support', 'oppose', 'question', 'unknown']
  const extras = Object.keys(allByFold)
    .filter(key => !canonical.includes(key))
    .sort()
  const order = canonical.concat(extras)
  const countsLabel = order
    .filter(role => allByFold[role]?.length)
    .map(role => `${expand(role)}: ${allByFold[role].length}`)
    .join(', ')
  const summary = countsLabel ? ` (${countsLabel})` : ''
  const sections = order
    .filter(role => visibleByFold[role]?.length)
    .map(role => {
      const rows = visibleByFold[role].map(edge => {
        return `<tr><td>${formatId(edge.fromId)}</td><td>${formatId(edge.toId)}</td></tr>`
      })
      const table = ['<table>', '<tr><th>from</th><th>to</th></tr>', ...rows, '</table>'].join('\n')
      return `<details><summary>${expand(role)} (${visibleByFold[role].length})</summary><hr>${table}<hr></details>`
    })
    .join('\n')
  const filteredCount = filteredEdges.length
  const visibleCount = visibleEdges.length
  const sumCounts = Object.values(visibleByFold).reduce((sum, group) => sum + group.length, 0)
  const warning =
    sumCounts == visibleCount ? '' : `<div>Warning: grouped counts mismatch (${sumCounts}/${visibleCount})</div>`
  if (sumCounts != visibleCount) console.warn('EDGES count mismatch', { sumCounts, visibleCount })
  const limitLabel = limit === null ? '' : ` (limit: ${limit})`
  return `${expand(command)} ⇒ ${visibleCount}/${filteredCount} edges${summary}${limitLabel}${sections}${warning}`
}

async function edges_emit({ elem, command, args, state }) {
  if (!state.discourse || !Array.isArray(state.discourse.edges))
    return state.api.trouble(elem, `EDGES requires EXTRACT first`)
  if (!state.discourse.edges.length) return state.api.trouble(elem, `No typed edges; run EXTRACT with a higher limit`)
  const pagesById = state.discourse.pagesById || state.pagesById
  elem.innerHTML = renderEdgesHtml(state.discourse.edges, args, pagesById, command)
}

function scope_lineup(elem, doc = document) {
  const items = [...doc.querySelectorAll('.page')]
  const index = items.indexOf(elem.closest('.page'))
  const safeIndex = index < 0 ? items.length - 1 : index
  return items.slice(0, safeIndex + 1)
}

function scope_references(elem, wikiObj = wiki) {
  const div = elem.closest('.page')
  const pageObject = wikiObj.lineup.atKey(div.dataset.key)
  const story = pageObject.getRawPage().story
  return story.filter(item => item.type == 'reference')
}

function parse_walk_command(command) {
  const match =
    command.match(
      /\b(\d+)? *(steps|days|weeks|months|hubs|lineup|references|questions?|claims?|supports?|opposes?)\b/i,
    ) || []
  const count = match[1]
  let way = match[2]?.toLowerCase()
  const singular = {
    questions: 'question',
    claims: 'claim',
    supports: 'support',
    opposes: 'oppose',
  }
  if (way in singular) way = singular[way]
  return { count, way }
}

function debug_emit({ elem, command, args, state }) {
  const flag = (args[0] || '').toLowerCase()
  if (flag && flag !== 'on' && flag !== 'off') return state.api.trouble(elem, `DEBUG expects "on" or "off".`)
  state.debug = flag ? flag === 'on' : true
  state.api.status(elem, command, ` ⇒ ${state.debug ? 'on' : 'off'}`)
}

function walks(count, way, neighborhood, scope = {}, discourse = null, debug = false) {
  const find = (slug, site) => neighborhood.find(info => info.slug == slug && (!site || info.domain == site))
  const finds = slugs => (slugs ? slugs.map(slug => find(slug)) : null)
  const good = info => info.links && Object.keys(info.links).length < 10
  const back = slug => neighborhood.filter(info => good(info) && slug in info.links)
  const dedup = (value, index, self) => self.findIndex(info => info.slug == value.slug) === index
  const newr = infos =>
    infos
      .toSorted((a, b) => b.date - a.date)
      .filter(dedup)
      .slice(0, 3)
  function blanket(info) {
    // hub[0] => slug
    // find(slug) => info
    // node(info) => nid
    // back(slug) => infos
    // newr(infos) => infos

    const graph = new Graph()
    const node = info => {
      return graph.addUniqNode('', {
        name: info.title.replaceAll(/ /g, '\n'),
        title: info.title,
        site: info.domain,
      })
    }
    const up = info => finds(info?.patterns?.up) ?? newr(back(info.slug))
    const down = info => info?.patterns?.down ?? Object.keys(info.links || {})

    // hub
    const nid = node(info)

    // parents of hub
    for (const parent of up(info)) {
      graph.addRel('', node(parent), nid)
    }

    // children of hub
    for (const link of down(info)) {
      const child = find(link)
      if (child) {
        const cid = node(child)
        graph.addRel('', nid, cid)

        // parents of children of hub
        for (const parent of up(child)) {
          graph.addRel('', node(parent), cid)
        }
      }
    }
    return graph
  }
  function roleWalk(role, count = 5) {
    if (!discourse || !Array.isArray(discourse.edges)) return []
    const limit = Number.isInteger(+count) && +count > 0 ? +count : 5
    const pages = scope.lineup ? scope.lineup() : []
    const pageIds = pages.map(div => {
      const pageObject = wiki.lineup.atKey(div.dataset.key)
      const slug = pageObject.getSlug()
      const site = location.host
      return `${site}+${slug}`
    })
    const inScope = new Set(pageIds)
    const fromIds = new Set()
    for (const edge of discourse.edges) {
      if (edge.role === role && inScope.has(edge.fromId)) fromIds.add(edge.fromId)
    }
    const scopedFromIdsCount = fromIds.size
    let fallbackApplied = false
    if (fromIds.size === 0) {
      fallbackApplied = true
      for (const edge of discourse.edges) {
        if (edge.role === role && edge.fromId) fromIds.add(edge.fromId)
      }
    }
    if (debug) {
      const roleFromIds = discourse.edges.filter(edge => edge.role === role).map(edge => edge.fromId)
      console.log('[mech][WALK]', {
        role,
        scopeCount: pages.length,
        inScopeCount: inScope.size,
        scopedFromIdsCount,
        matchingFromIdsCount: fromIds.size,
        fallbackApplied,
        pageIdSample: pageIds[0],
        pageIds,
        roleFromIdsSample: roleFromIds.slice(0, 5),
      })
    }
    const infos = [...fromIds]
      .map(fromId => {
        const [domain, ...rest] = fromId.split('+')
        const slug = rest.join('+')
        return find(slug, domain)
      })
      .filter(Boolean)
      .toSorted((a, b) => b.date - a.date)
      .slice(0, limit)
    return infos.map(info => ({ name: info.title, graph: blanket(info) }))
  }
  return roleWalk(way, count)
}
function role_walk_emit({ elem, command, args, state }) {
  if (!('neighborhood' in state))
    return state.api.trouble(elem, `WALK expects state.neighborhood, like from NEIGHBORS.`)
  if (state.debug) state.api.inspect(elem, 'neighborhood', state)
  const { count, way } = parse_walk_command(command)
  if (state.debug) console.log('[mech][WALK]', { command, parsed: { count, way }, args })
  if (!way && command != 'WALK') return state.api.trouble(elem, `WALK can't understand rest of this block.`)
  const roleWays = new Set(['question', 'claim', 'support', 'oppose'])
  if (
    roleWays.has(way) &&
    (!state.discourse || !Array.isArray(state.discourse.edges) || !state.discourse.edges.length)
  ) {
    return state.api.trouble(elem, `WALK ${way} requires EXTRACT first`)
  }
  const scope = {
    lineup() {
      return scope_lineup(elem)
    },
    references() {
      return scope_references(elem)
    },
  }
  let scopeItems = null
  const scoped = {
    lineup() {
      scopeItems ??= scope.lineup()
      return scopeItems
    },
    references() {
      scopeItems ??= scope.references()
      return scopeItems
    },
  }
  const steps = walks(count, way, state.neighborhood, scoped, state.discourse, state.debug)
  const aspects = steps.filter(({ graph }) => graph)
  if (state.debug) {
    if (scopeItems) {
      console.log('[mech][WALK]', {
        way,
        scopeCount: scopeItems.length,
        scopeSample: scopeItems.slice(0, 3),
      })
    }
    console.log('[mech][WALK]', { way, steps: steps.length, first: steps[0], last: steps.at(-1) })
  }
  const nodes = aspects.map(({ graph }) => graph.nodes).flat()
  state.api.status(elem, command, ` ⇒ ${aspects.length} aspects, ${nodes.length} nodes`)
  if (steps.find(({ graph }) => !graph)) state.api.trouble(elem, `WALK skipped sites with no links in sitemaps`)
  if (aspects.length) {
    state.aspect = state.aspect || []
    const obj = state.aspect.find(obj => obj.id == elem.id)
    if (obj) obj.result = aspects
    else state.aspect.push({ id: elem.id, result: aspects, source: command })
    // const item = elem.closest('.item')
    // item.classList.add('aspect-source')
    // item.aspectData = () => state.aspect.map(obj => obj.result).flat()
    state.api.publishSourceData(elem, 'aspect', state.aspect.map(obj => obj.result).flat())
    if (state.debug) console.log('[mech][WALK]', { publish: 'aspect', aspectCount: state.aspect.length })
  }
}

const installed = new WeakSet()
export function installDiscourse(catalog) {
  if (!catalog || typeof catalog !== 'object') throw new Error('Incompatible catalog')
  if (installed.has(catalog)) throw new Error('Already installed')
  for (const name of ['EXTRACT', 'EDGES', 'DEBUG']) if (name in catalog) throw new Error('Command collision: ' + name)
  for (const name of ['WALK', 'CODE', 'SOLO', 'LISTEN', 'MESSAGE'])
    if (typeof catalog[name]?.emit !== 'function') throw new Error('Incompatible emitter: ' + name)
  const originalWalk = catalog.WALK.emit
  const replacements = {
    EXTRACT: { emit: extract_emit },
    EDGES: { emit: edges_emit },
    DEBUG: { emit: debug_emit },
    WALK: {
      emit(stuff) {
        const { way } = parse_walk_command(stuff.command)
        return new Set(['question', 'claim', 'support', 'oppose']).has(way)
          ? role_walk_emit(stuff)
          : originalWalk(stuff)
      },
    },
  }
  for (const [name, descriptor] of Object.entries(replacements)) {
    if (!Object.isExtensible(catalog) && !(name in catalog)) throw new Error('Nonextensible catalog')
    const old = Object.getOwnPropertyDescriptor(catalog, name)
    if (old && !old.writable) throw new Error('Readonly command: ' + name)
  }
  Object.assign(catalog, replacements)
  installed.add(catalog)
  return { added: ['EXTRACT', 'EDGES', 'DEBUG'], wrapped: ['WALK'], originalWalk }
}
export { extract_edges_from_story, renderEdgesHtml, parse_walk_command, validSiteAuthority }
