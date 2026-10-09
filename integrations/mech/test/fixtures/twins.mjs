// Trusted, authored offline Wiki data. Page identities include site + slug.
export const alpha = 'alpha.fixture.test'
export const beta = 'beta.fixture.test'
export const twinSlug = 'shared-page'
export const rootSlug = 'question-root'
export const fixture = {
  pages: [
    {
      site: alpha,
      slug: rootSlug,
      date: 200,
      title: 'Question Root',
      story: [
        { id: 'root-question-fold', type: 'pagefold', text: 'Question' },
        { id: 'root-link', type: 'paragraph', text: 'Which interpretation of [[Shared Page]] should be used?' },
      ],
    },
    {
      site: alpha,
      slug: twinSlug,
      date: 100,
      title: 'Alpha Older Interpretation',
      story: [
        { id: 'alpha-content', type: 'paragraph', text: 'Trusted ALPHA interpretation; local-site version, date 100.' },
      ],
    },
    {
      site: beta,
      slug: twinSlug,
      date: 300,
      title: 'Beta Newer Interpretation',
      story: [
        { id: 'beta-content', type: 'paragraph', text: 'Trusted BETA interpretation; remote-site version, date 300.' },
      ],
    },
  ],
  sitemaps: {
    [alpha]: [
      { domain: alpha, slug: rootSlug, date: 200, title: 'Question Root', links: { [twinSlug]: 1 } },
      { domain: alpha, slug: twinSlug, date: 100, title: 'Alpha Older Interpretation', links: {} },
    ],
    [beta]: [{ domain: beta, slug: twinSlug, date: 300, title: 'Beta Newer Interpretation', links: {} }],
  },
}
export const clone = x => JSON.parse(JSON.stringify(x))
