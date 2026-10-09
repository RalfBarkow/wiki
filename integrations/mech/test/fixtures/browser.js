// Trusted scratch-owned Wiki/DOM environment. Mech APIs remain real.
window.plugins = {}
window.isOwner = false
const fixtureSite = 'alpha.fixture.test'
const roles = ['question', 'claim', 'support', 'oppose']
const fixturePages = Object.fromEntries(
  roles.map((role, index) => [
    role + '-root',
    {
      title: role[0].toUpperCase() + role.slice(1) + ' Root',
      story: [
        { id: role + '-fold', type: 'pagefold', text: role },
        { id: role + '-link', type: 'paragraph', text: 'See [[Target Page]]' },
      ],
    },
  ]),
)
fixturePages['target-page'] = {
  title: 'Target Page',
  story: [{ id: 'target-text', type: 'paragraph', text: 'Trusted local target.' }],
}
const fixtureMap = Object.entries(fixturePages).map(([slug, page], i) => ({
  domain: fixtureSite,
  slug,
  title: page.title,
  date: 500 - i * 100,
  links: slug === 'target-page' ? {} : { 'target-page': 1 },
}))
window.fixtureJSON = fixturePages
let rawPage,
  remote = false
window.wiki = {
  lineup: {
    atKey(key) {
      if (key !== 'current') throw Error('Unknown fixture page key')
      return { getSlug: () => 'question-root', getRawPage: () => rawPage, isRemote: () => remote }
    },
  },
  neighborhoodObject: { sites: { [fixtureSite]: { sitemap: fixtureMap, sitemapRequestInflight: false } } },
  textEditor() {
    throw Error('Editing disabled')
  },
  pageHandler: { context: [] },
  debug: false,
}
let mod
const copy = x => JSON.parse(JSON.stringify(x))
window.harness = {
  async load() {
    mod = await import('/bundle.mjs')
    this.module = mod
    this.ready = true
    return true
  },
  prepare(text, initial = {}, options = {}) {
    window.isOwner = !!options.owner
    remote = !!options.remote
    rawPage = {
      title: 'Trusted Browser Fixture',
      story: [
        ...copy(fixturePages['question-root'].story),
        ...(options.codes || []).map((text, i) => ({ id: 'trusted-code-' + i, type: 'code', text })),
      ],
    }
    document.querySelector('.main').innerHTML =
      '<section class="page" id="question-root" data-key="current"><div class="item mech" data-id="trusted-mech-item"></div></section>'
    const page = document.querySelector('.page')
    $(page).data('key', 'current').data('data', rawPage).data('site', fixtureSite)
    const item = document.querySelector('.item')
    const nest = mod.tree(text.split('\n'), [], 0)
    const html = mod.format(nest)
    item.innerHTML = '<div style="background-color:#eee;padding:15px;border-top:8px;">' + html + '</div>'
    const visits = []
    const api = {
      ...mod.api,
      element(key) {
        visits.push(key)
        return mod.api.element(key)
      },
    }
    const state = {
      context: {
        item: { id: 'trusted-mech-item', type: 'mech', text },
        itemId: 'trusted-mech-item',
        pageKey: 'current',
        page: rawPage,
        origin: window.origin,
        site: fixtureSite,
        slug: 'question-root',
        title: rawPage.title,
        blocks: Object.keys(mod.blocks),
      },
      api,
      ...copy(initial),
    }
    this.prepared = { nest, state, visits }
    return nest.filter(p => p.command).map(p => ({ command: p.command, key: p.key }))
  },
  async execute(text, initial = {}, options = {}) {
    this.prepare(text, initial, options)
    await mod.run(this.prepared.nest, this.prepared.state, options.initiator)
    return this.snapshot()
  },
  snapshot() {
    const { api, ...state } = this.prepared.state
    return {
      state: copy(state),
      visits: this.prepared.visits.slice(),
      blocks: [...document.querySelectorAll('span.block')].map(e => ({
        id: e.id,
        text: e.textContent,
        html: e.innerHTML,
      })),
      aspectSource: document.querySelector('.item').aspectData
        ? copy(document.querySelector('.item').aspectData())
        : null,
    }
  },
  emit(text, options = {}) {
    this.prepare('', {}, options)
    const item = { id: 'actual-emission', type: 'mech', text }
    window.plugins.mech.emit($('.item'), item)
    return { html: document.querySelector('.item').innerHTML, catalog: Object.keys(mod.blocks) }
  },
  block(command) {
    return [...document.querySelectorAll('span.block')].find(e => e.textContent.startsWith(command))
  },
  diagnostics() {
    for (const button of [...document.querySelectorAll('button.trouble')]) button.click()
    return [...document.querySelectorAll('span.trouble')].map(e => e.textContent)
  },
  fixtures: copy({ site: fixtureSite, sitemap: fixtureMap, pages: fixturePages }),
}
window.codeFixtureEvaluations = 0
