// Explicit trusted-input reconstruction; no network or dependency installation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const [archive,compiler]=process.argv.slice(2)
if(!compiler)throw Error('Usage: verified highlight.js-11.11.1.tgz esbuild-0.28.2-executable')
const here=path.dirname(fileURLToPath(import.meta.url)),fixtures=path.join(here,'fixtures')
const records=JSON.parse(fs.readFileSync(path.join(fixtures,'provenance.json')))
const recorded=records.find(r=>r.file==='highlight.js')
assert.equal(recorded.version,'11.11.1')
assert.equal('sha512-'+crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64'),recorded.integrity)
assert.equal(execFileSync(compiler,['--version'],{encoding:'utf8'}).trim(),'0.28.2')
const work=fs.mkdtempSync(path.join(os.tmpdir(),'wiki-code-display-'))
try{
 execFileSync('tar',['-xf',path.resolve(archive),'-C',work])
 assert.equal(JSON.parse(fs.readFileSync(path.join(work,'package/package.json'))).version,'11.11.1')
 fs.writeFileSync(path.join(work,'entry.mjs'),"import HighlightJS from './package/lib/index.js'\nexport { HighlightJS }\nexport default HighlightJS\n")
 execFileSync(path.resolve(compiler),['entry.mjs','--bundle','--format=esm','--platform=browser','--outfile=highlight.js','--log-level=warning'],{cwd:work})
 fs.copyFileSync(path.join(work,'highlight.js'),path.join(fixtures,'highlight.js'))
 fs.copyFileSync(path.join(work,'package/styles/github.min.css'),path.join(fixtures,'highlight.css'))
 for(const r of records.filter(r=>r.version==='11.11.1'))r.sha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtures,r.file))).digest('hex')
 fs.writeFileSync(path.join(fixtures,'provenance.json'),JSON.stringify(records,null,2)+'\n')
}finally{fs.rmSync(work,{recursive:true,force:true})}
