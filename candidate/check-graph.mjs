import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const semver = require('semver')
const lock = JSON.parse(fs.readFileSync('package-lock.json'))
const expected = JSON.parse(fs.readFileSync('candidate/provenance.json'))
assert.equal(process.versions.node, expected.nodeVersion)
const errors = []
for (const [name, p] of Object.entries(lock.packages)) {
  if (name && (name.endsWith('/wiki') || p.name === 'wiki')) errors.push(`nested wiki runtime: ${name}`)
  if (p.engines?.node && !semver.satisfies(process.versions.node, p.engines.node)) errors.push(`${name}: Node ${p.engines.node}`)
}
for (const name of ['wiki-server', 'wiki-client','wiki-plugin-mech','wiki-plugin-solo','wiki-plugin-journalmatic']) {
  const dir = path.resolve('node_modules', name)
  const installed = JSON.parse(fs.readFileSync(path.join(dir,'package.json')))
  const source = JSON.parse(fs.readFileSync(`candidate/packages-manifests/${name}.json`))
  assert.equal(installed.version, expected.components[name].version)
  assert.deepEqual(installed.dependencies, source.dependencies)
  const resolve = createRequire(path.join(dir,'package.json'))
  for (const [dep, range] of Object.entries(installed.dependencies || {})) {
    let manifest
    try { manifest = resolve.resolve(dep+'/package.json') }
    catch { let p=path.dirname(resolve.resolve(dep)); while (!fs.existsSync(path.join(p,'package.json'))) p=path.dirname(p); manifest=path.join(p,'package.json') }
    const version=JSON.parse(fs.readFileSync(manifest)).version
    if (!semver.satisfies(version,range)) errors.push(`${name}: ${dep}@${version} does not satisfy ${range}`)
  }
}
const client=JSON.parse(fs.readFileSync('candidate/packages-manifests/wiki-client.json'))
for (const [dep,range] of Object.entries(client.devDependencies)) {
  const version=lock.packages['node_modules/'+dep]?.version
  if (!version || !semver.satisfies(version,range)) errors.push(`client build: ${dep}@${version} does not satisfy ${range}`)
}
assert.deepEqual(errors,[])
const report={node:process.versions.node,packages:Object.keys(lock.packages).length,nestedWiki:[],engines:'all satisfied',components:Object.fromEntries(Object.entries(lock.packages).filter(([p])=>/^node_modules\/wiki-/.test(p)&&p.split('/').length===2).map(([p,v])=>[p.slice(13),{version:v.version,resolved:v.resolved}]))}
fs.writeFileSync('candidate/graph-report.json',JSON.stringify(report,null,2)+'\n')
console.log('P41 graph verified:',report.packages,'packages; no nested wiki; all Node engines satisfied')
