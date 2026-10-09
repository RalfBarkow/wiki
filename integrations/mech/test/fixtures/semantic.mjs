// Authored trusted offline fixtures; no production page text or remote code.
export const site = 'alpha.fixture.test'
export const pages = {
  '//alpha.fixture.test/root-old.json': {
    title: 'Old Root',
    story: [
      { type: 'pagefold', text: ' Questions ' },
      { type: 'paragraph', text: '[[Target Page]]' },
      { type: 'pagefold', text: 'Claims' },
      { type: 'paragraph', text: '[[Root New]] and [[beta.fixture.test/root-new]]' },
      { type: 'pagefold', text: 'Support' },
      { type: 'reference', site: 'beta.fixture.test', slug: 'root-new' },
      { type: 'pagefold', text: 'Oppose' },
      { type: 'paragraph', text: '[[Target Page]]' },
      { type: 'pagefold', text: 'Hypothesis' },
      { type: 'paragraph', text: '[[Excluded]]' },
    ],
  },
  '//alpha.fixture.test/root-new.json': {
    title: 'New Root',
    story: [
      { type: 'pagefold', text: 'question' },
      { type: 'paragraph', text: '[[Root Old]]' },
      { type: 'pagefold', text: 'Claim!' },
      { type: 'reference', site: 'beta.fixture.test', slug: 'root-new' },
    ],
  },
  '//beta.fixture.test/root-new.json': {
    title: 'New Root',
    story: [
      { type: 'pagefold', text: 'supports' },
      { type: 'paragraph', text: '[[alpha.fixture.test/root-old]]' },
    ],
  },
  '//alpha.fixture.test/target-page.json': {
    title: 'Target Page',
    story: [
      { type: 'pagefold', text: 'claim' },
      { type: 'paragraph', text: '[[Root Old]] and [[https://excluded.invalid/test]]' },
    ],
  },
  '//alpha.fixture.test/broken.json': { title: 'Malformed', story: 'not an array' },
  '//alpha.fixture.test/fails.json': { fixtureError: 'fetch failure' },
  '//alpha.fixture.test/claim-link-survey.json': {
    title: 'Claim Link Survey',
    story: [
      {
        type: 'frame',
        survey: [
          { slug: 'root-old', classification: 'question' },
          { slug: 'root-new', classification: 'claim' },
        ],
      },
    ],
  },
}
export const neighborhoods = [
  [
    { domain: site, slug: 'root-old', title: 'Old Root', date: 100, links: { 'target-page': 1, 'root-new': 1 } },
    { domain: site, slug: 'root-new', title: 'New Root', date: 300, links: { 'root-old': 1 } },
    { domain: site, slug: 'target-page', title: 'Target Page', date: 50, links: { 'root-old': 1 } },
    { domain: site, slug: 'claim-link-survey', title: 'Claim Link Survey', date: 10, links: {} },
  ],
  [{ domain: 'beta.fixture.test', slug: 'root-new', title: 'New Root', date: 250, links: { 'root-old': 1 } }],
]
export const failureNeighborhood = [
  ...neighborhoods.flat(),
  { domain: site, slug: 'broken', title: 'Broken', date: 20, links: {} },
  { domain: site, slug: 'fails', title: 'Fails', date: 30, links: {} },
]
export const clone = x => JSON.parse(JSON.stringify(x))
