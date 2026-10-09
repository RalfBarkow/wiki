// Disposable real-server instance: unchanged package source; fixture-only security plugin.
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const [wikiRoot,work,port,site] = process.argv.slice(2)
const modules=path.join(work,'node_modules');fs.mkdirSync(modules,{recursive:true})
for(const entry of fs.readdirSync(path.join(wikiRoot,'node_modules'))){
  const target=path.join(modules,entry)
  if(entry==='wiki-server')fs.cpSync(path.join(wikiRoot,'node_modules',entry),target,{recursive:true})
  else fs.symlinkSync(path.join(wikiRoot,'node_modules',entry),target,'dir')
}
fs.copyFileSync(path.join(wikiRoot,'package.json'),path.join(work,'package.json'))
fs.symlinkSync(work,path.join(modules,'wiki'),'dir')
const security=path.join(modules,'wiki-security-fixture');fs.mkdirSync(security)
fs.writeFileSync(path.join(security,'package.json'),JSON.stringify({name:'wiki-security-fixture',main:'index.cjs'}))
fs.mkdirSync(path.join(security,'client'))
fs.writeFileSync(path.join(security,'client/security.js'),'window.plugins.security={setup(){}}')
fs.writeFileSync(path.join(security,'index.cjs'),`module.exports=()=>({
 getOwner:()=> 'Disposable Fixture Owner',retrieveOwner:done=>done(null),
 getUser:req=>req.headers.cookie?.includes('fixture_auth=trusted')?'Fixture Owner':null,
 isAuthorized:req=>!!req.headers.cookie?.includes('fixture_auth=trusted'),
 isAdmin:req=>!!req.headers.cookie?.includes('fixture_auth=trusted'),
 defineRoutes:app=>{app.post('/fixture/login',(req,res)=>{res.setHeader('Set-Cookie','fixture_auth=trusted; Path=/; HttpOnly; SameSite=Lax');res.send('fixture only')});}
});`)
process.chdir(work)
const {default:server}=await import(pathToFileURL(path.join(modules,'wiki-server/index.js')))
const app=await server({port:Number(port),url:site,data:path.join(work,'data'),packageDir:modules,
 root:path.join(modules,'wiki-server'),client:path.join(wikiRoot,'node_modules/wiki-client/client'),security_type:'fixture',test:true,
 farm:false,neighbors:'',cookieSecret:'disposable-fixture-secret-not-used-in-production'})
const listening=app.listen(Number(port),'127.0.0.1',()=>app.emit('running-serv',listening))
process.on('SIGTERM',()=>{listening.close();process.exit(0)})
