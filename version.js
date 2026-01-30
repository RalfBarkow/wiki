/*
 * Federated Wiki : Node Server
 *
 * Copyright Ward Cunningham and other contributors
 * Licensed under the MIT license.
 * https://github.com/fedwiki/wiki/blob/master/LICENSE.txt
 */

// prints `(console.info()` the version of wiki components we have installed.

import path from 'node:path'
import url from 'node:url'

const wikiPackageImport = async () => {
  let done = false
  return new Promise(resolve => {
    import('wiki/package.json', { with: { type: 'json' } })
      .then(imported => {
        done = true
        resolve(imported.default)
      })
      .catch(e => {
        return e
      })
      .then(async () => {
        if (done) return
        const packageJsonPath = path.join(process.cwd(), 'package.json')
        const packageJsonUrl = url.pathToFileURL(packageJsonPath).href
        import(packageJsonUrl, { with: { type: 'json' } })
          .then(imported => {
            resolve(imported.default)
          })
          .catch(e => console.error('problems importing package', e))
      })
  })
}

const packageJson = await wikiPackageImport()

const getPackageVersion = packageName => {
  return new Promise(resolve => {
    let done = false
    import(`${packageName}/package.json`, { with: { type: 'json' } })
      .then(imported => {
        done = true
        resolve({ [packageName]: imported.default.version })
      })
      .catch(e => {
        console.error(`Error reading package for ${packageName}:`, e)
        return e
      })
      .then(() => {
        if (done) return
        resolve({ [packageName]: 'unknown' })
      })
  })
}

const versions = {}

const security = () => {
  return new Promise(resolve => {
    Promise.all(
      Object.keys(packageJson.dependencies)
        .filter(depend => depend.startsWith('wiki-security'))
        .map(key => {
          return getPackageVersion(key)
        }),
    ).then(values => {
      resolve({ security: values.reduce((acc, cV) => Object.assign(acc, cV), {}) })
    })
  })
}

const plugins = () => {
  return new Promise(resolve => {
    Promise.all(
      Object.keys(packageJson.dependencies)
        .filter(depend => depend.startsWith('wiki-plugin'))
        .map(key => {
          return getPackageVersion(key)
        }),
    ).then(values => {
      resolve({ plugins: values.reduce((acc, cV) => Object.assign(acc, cV), {}) })
    })
  })
}

export function version() {
  Promise.all([getPackageVersion('wiki-server'), getPackageVersion('wiki-client'), security(), plugins()]).then(v => {
    Object.assign(versions, { [packageJson.name]: packageJson.version }, ...v)
    console.info(JSON.stringify(versions, null, ' '))
  })
}
