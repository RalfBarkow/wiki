import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
export const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'))
export const sha = b => crypto.createHash('sha256').update(b).digest('hex')
export const pins = readJSON(path.join(moduleRoot, 'sources.json'))
export function argumentsOf(args = process.argv.slice(2)) {
  const result = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || !args[i + 1]) throw Error('Expected --name value')
    result[args[i].slice(2)] = args[i + 1]
  }
  return result
}
export function authoredFiles(dir = moduleRoot, prefix = '') {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      if (['.artifacts', 'node_modules', '.git'].includes(entry.name)) return []
      const name = prefix + entry.name,
        p = path.join(dir, entry.name)
      return entry.isDirectory() ? authoredFiles(p, name + '/') : [[name, sha(fs.readFileSync(p))]]
    })
}
export function moduleIdentity() {
  const pkg = readJSON(path.join(moduleRoot, 'package.json'))
  return {
    ...pins.wiki,
    moduleVersion: pkg.version,
    extensionCommitOid: null,
    workingTree: true,
    sourceContentSha256: sha(
      JSON.stringify(authoredFiles().filter(([name]) => !name.startsWith('evidence/acceptance/'))),
    ),
    sourceDigestExcludes: ['evidence/acceptance/'],
    lockfileSha256: sha(fs.readFileSync(path.join(moduleRoot, 'package-lock.json'))),
  }
}
export function verifySnapshot(dir, source) {
  const actual = authoredFiles(dir)
  assert.deepEqual(
    actual.map(x => x[0]).sort(),
    Object.keys(source.files).sort(),
    'Snapshot has missing/extra authored files',
  )
  for (const [file, hash] of Object.entries(source.files))
    assert.equal(sha(fs.readFileSync(path.join(dir, file))), hash, 'Source integrity: ' + file)
}
export function materialize(repository, source, target) {
  execFileSync('git', ['-C', repository, 'cat-file', '-e', source.oid + '^{commit}'], { stdio: 'pipe' })
  fs.mkdirSync(target, { recursive: true })
  const archive = execFileSync('git', ['-C', repository, 'archive', '--format=tar', source.oid], {
    maxBuffer: 32 * 1024 * 1024,
  })
  execFileSync('tar', ['-xf', '-', '-C', target], { input: archive })
  verifySnapshot(target, source)
}
export async function dependencyTools(directory) {
  const pkg = readJSON(path.join(moduleRoot, 'package.json')),
    lock = readJSON(path.join(moduleRoot, 'package-lock.json'))
  const versions = {}
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.equal(lock.packages['node_modules/' + name]?.version, version, 'Lock version ' + name)
    const installed = readJSON(path.join(directory, name, 'package.json'))
    assert.equal(installed.version, version, 'Installed dependency ' + name)
    versions[name] = version
  }
  return { versions }
}
export async function buildProfiles({
  repository,
  dependencies,
  output,
  profiles = ['upstream', 'discourse'],
  withBaseline = false,
}) {
  for (const profile of profiles) if (!pins.profiles.includes(profile)) throw Error('Unknown profile ' + profile)
  if (!repository) throw Error('Explicit --repository is required; source is never fetched')
  dependencies = path.resolve(dependencies || path.join(moduleRoot, 'node_modules'))
  output = path.resolve(output || path.join(moduleRoot, '.artifacts/build'))
  const identity = moduleIdentity()
  const { versions } = await dependencyTools(dependencies)
  fs.mkdirSync(output, { recursive: true })
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mech-maintained-build-'))
  try {
    materialize(repository, pins.upstream, path.join(work, 'upstream'))
    fs.cpSync(path.join(moduleRoot, 'src'), path.join(work, 'src'), { recursive: true })
    fs.symlinkSync(dependencies, path.join(work, 'node_modules'), 'dir')
    const names = [...profiles]
    if (withBaseline) {
      materialize(repository, pins.behavioralBaseline, path.join(work, 'baseline'))
      names.push('baseline')
      fs.writeFileSync(
        path.join(work, 'src/baseline-entry.mjs'),
        "import {blocks,run,api} from '../baseline/src/client/blocks.js';\nimport {tree,format} from '../baseline/src/client/interpreter.js';\nimport {emit,bind} from '../baseline/src/client/mech.js';\nexport {blocks,run,api,tree,format,emit,bind};\n",
      )
    }
    const built = []
    for (const profile of names) {
      const entry = profile === 'baseline' ? 'baseline' : profile === 'discourse' ? 'discourse' : 'upstream'
      const compiler = path.join(dependencies, 'esbuild/bin/esbuild')
      assert.equal(
        execFileSync(compiler, ['--version'], { encoding: 'utf8' }).trim(),
        versions.esbuild,
        'Compiler version',
      )
      execFileSync(
        compiler,
        [
          'src/' + entry + '-entry.mjs',
          '--bundle',
          '--platform=browser',
          '--format=esm',
          '--preserve-symlinks',
          '--alias:mech-upstream=./upstream',
          '--outfile=compiled/mech.js',
          '--metafile=compiled/meta.json',
          '--log-level=warning',
        ],
        { cwd: work, stdio: 'pipe' },
      )
      const data = fs.readFileSync(path.join(work, 'compiled/mech.js')),
        dir = path.join(output, profile, 'client')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'mech.js'), data)
      const source = profile === 'baseline' ? pins.behavioralBaseline : pins.upstream
      fs.copyFileSync(path.join(work, 'upstream', 'client/mech.css'), path.join(dir, 'mech.css')) // Baseline test control uses the trusted upstream stylesheet, as in the original harness.
      const meta = JSON.stringify(readJSON(path.join(work, 'compiled/meta.json')), null, 2) + '\n'
      fs.writeFileSync(path.join(output, profile, 'metafile.json'), meta)
      const manifest = {
        schemaVersion: 1,
        profile,
        source: { authority: source.authority, oid: source.oid, filesSha256: sha(JSON.stringify(source.files)) },
        extension: profile === 'discourse' ? identity : null,
        recipe: {
          wiki: identity,
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          dependencies: versions,
          lockfileSha256: identity.lockfileSha256,
          format: 'esm',
          bundled: true,
        },
        artifacts: {
          'client/mech.js': { sha256: sha(data), bytes: data.length },
          'client/mech.css': { sha256: sha(fs.readFileSync(path.join(dir, 'mech.css'))) },
          'metafile.json': { sha256: sha(meta) },
        },
      }
      fs.writeFileSync(path.join(output, profile, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n')
      built.push(manifest)
    }
    verifySnapshot(path.join(work, 'upstream'), pins.upstream)
    if (withBaseline) verifySnapshot(path.join(work, 'baseline'), pins.behavioralBaseline)
    assert.equal(
      moduleIdentity().sourceContentSha256,
      identity.sourceContentSha256,
      'Authored module changed during build',
    )
    return built
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = argumentsOf()
  const profiles = args.profile ? (args.profile === 'all' ? pins.profiles : [args.profile]) : pins.profiles
  const built = await buildProfiles({
    repository: args.repository,
    dependencies: args.dependencies,
    output: args.output,
    profiles,
  })
  console.log(JSON.stringify(built, null, 2))
}
