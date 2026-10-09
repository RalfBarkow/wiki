import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
const [modulePath, snapshot, profile, output, pinFile] = process.argv.slice(2)
const recorded = JSON.parse(fs.readFileSync(pinFile))
const {buildProfiles,verifySnapshot,pins,moduleIdentity} = await import(pathToFileURL(path.join(modulePath,'scripts/build.mjs')))
assert.equal(moduleIdentity().sourceContentSha256,recorded.module.sourceContentSha256)
assert.equal(moduleIdentity().lockfileSha256,recorded.module.lockfileSha256)
assert.equal(pins.upstream.oid,recorded.upstreamMech.oid)
verifySnapshot(snapshot,pins.upstream)
const repository=fs.mkdtempSync(path.join(os.tmpdir(),'mech-evidence-object-store-'))
try {
  // Reconstitute original Git objects from verified snapshot bytes and the original
  // commit object. No history is invented, fetched or used by this archive-only builder.
  fs.cpSync(snapshot,repository,{recursive:true})
  const git=(...args)=>execFileSync('git',['-C',repository,...args],{encoding:'utf8'}).trim()
  git('init','-q'); git('-c','core.autocrlf=false','add','-f','.')
  assert.equal(git('write-tree'),recorded.upstreamMech.treeOid,'Pinned Git tree mismatch')
  const oid=execFileSync('git',['-C',repository,'hash-object','-w','-t','commit','--stdin'],
    {input:recorded.upstreamMech.commitObject,encoding:'utf8'}).trim()
  assert.equal(oid,pins.upstream.oid,'Pinned original commit object mismatch')
  git('update-ref','refs/heads/pinned-source',oid)
  const [manifest]=await buildProfiles({repository,dependencies:path.join(modulePath,'node_modules'),profiles:[profile],output})
  manifest.packaging={moduleSource:recorded.module,upstreamTreeOid:recorded.upstreamMech.treeOid,sourceSnapshotNarHash:recorded.upstreamMech.narHash,profile,builderContentIdentity:manifest.recipe.wiki}
  fs.writeFileSync(path.join(output,profile,'provenance.json'),JSON.stringify(manifest,null,2)+'\n')
} finally {fs.rmSync(repository,{recursive:true,force:true})}
