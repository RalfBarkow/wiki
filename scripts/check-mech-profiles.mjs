import fs from 'node:fs'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const record=JSON.parse(fs.readFileSync('docs/mech-profile-consumer-acceptance.json'))
const old=JSON.parse(execFileSync('git',['show',record.baseCommitOid+':flake.lock']))
const current=JSON.parse(fs.readFileSync('flake.lock'))
for(const [key,value] of Object.entries(old.nodes))if(key!=='root')assert.deepEqual(current.nodes[key],value)
assert.equal(current.nodes['mech-composition'].locked.rev,record.compositionCommitOid)
assert.equal(current.nodes['mech-composition'].locked.type,'github')
const override=process.argv[2]?['--override-input','mech-composition',process.argv[2]]:[]
const output=JSON.parse(execFileSync('nix',['eval','--offline','--no-write-lock-file',...override,'--json','.#packages.x86_64-darwin','--apply','p: builtins.mapAttrs (n: v: v.outPath or "non-package") p'],{encoding:'utf8'}))
assert.deepEqual(output,record.outputs,'Recipe outputs or unchanged default identity drifted')
for(const p of ['mech-upstream','mech-discourse','wiki-upstream','wiki-discourse'])assert(output[p])
console.log('PASS unchanged original lock/default and exact shared-profile output identities (Darwin; Linux separately evaluated)')
