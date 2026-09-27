import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import * as esbuild from 'esbuild'
const require=createRequire(import.meta.url)
const root=process.cwd()
const p=JSON.parse(fs.readFileSync('candidate/provenance.json'))
const client=path.resolve('node_modules/wiki-client')
const clientRev=p.components['wiki-client'].upstreamCommit+'+p41.'+p.components['wiki-client'].archiveSha256.slice(0,12)
for (const script of ['build-client.mjs','build-testclient.mjs']) execFileSync(process.execPath,['scripts/'+script],{cwd:client,stdio:'inherit',env:{...process.env,WIKI_CLIENT_REV:clientRev,SOURCE_DATE_EPOCH:'1'}})
// Mech's source pin is unchanged. Bundle it with the declared esbuild 0.25 toolchain,
// using explicit immutable provenance instead of its Git/worktree-dependent stamper.
const mech=path.resolve('node_modules/wiki-plugin-mech')
const mechBuild=await import('mech-esbuild')
await mechBuild.build({entryPoints:[path.join(mech,'src/client/mech.js')],bundle:true,format:'iife',minify:true,sourcemap:true,outfile:path.join(mech,'client/mech.js'),define:{__MECH_VERSION__:JSON.stringify(p.components['wiki-plugin-mech'].version),__MECH_BUILD__:JSON.stringify('1970-01-01T00:00:01.000Z'),__MECH_COMMIT__:JSON.stringify(p.components['wiki-plugin-mech'].sourceCommit)}})
// No jQuery import in the personal test entrypoint.
assert(!/jquery/i.test(fs.readFileSync(path.join(client,'client/runtests.html'),'utf8')))
execFileSync(process.execPath,[path.join(root,'node_modules/mocha/bin/mocha.js'),'test/util.js','test/random.js','test/page.js','test/lineup.js','test/drop.js','test/revision.js','test/resolve.js','test/wiki.js','test/siteAdapter.js','test/networkSecurity.js','test/secureContext.js'],{cwd:client,stdio:'inherit'})
const {newPage}=require(path.join(client,'lib/page.js'))
const original=newPage({title:'Synthetic',story:[],journal:[{type:'create',date:1,item:{title:'Synthetic',story:[]}}]})
const update=newPage({title:'Synthetic',story:[],journal:[{type:'create',date:1,item:{title:'Synthetic',story:[]}},{type:'add',id:'p41-item',date:2,item:{id:'p41-item',type:'paragraph',text:'Merged'}}]},'neighbor.example.test')
const merged=original.merge(update)
assert(merged && merged.getRawPage().story.some(x=>x.id==='p41-item'))
assert(fs.readFileSync(path.join(client,'lib/neighborhood.js'),'utf8').includes("site.endsWith(':')"))
console.log('PASS upstream merge return, colon normalization and personal optional-index/network tests')
