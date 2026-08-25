import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
const VAULT='C:/Vault', HOST='http://192.168.1.150:7865'
const TOK=process.env.T150
const DIRS=['sessions','distilled','notes','digests','skills','chats','state']
const ROOT=['USER.md','AGENTS.md']
const MAXB=8*1024*1024

const j=async(p,b)=>{const r=await fetch(HOST+p,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+TOK},body:JSON.stringify(b)});return{status:r.status,body:await r.json().catch(()=>null)}}

function walk(dir,out){ let e; try{e=readdirSync(dir,{withFileTypes:true})}catch{return}
  for(const x of e){ const p=join(dir,x.name)
    if(x.isDirectory()){walk(p,out);continue}
    if(!/\.(md|json|txt)$/i.test(x.name))continue
    const st=statSync(p); if(st.size>MAXB){out.skipped.push(x.name);continue}
    const buf=readFileSync(p)
    out.entries.push({path:relative(VAULT,p).split(String.fromCharCode(92)).join('/'),sha256:createHash('sha256').update(buf).digest('hex'),size:st.size})
  } }

const local={entries:[],skipped:[]}
for(const d of DIRS) walk(join(VAULT,d),local)
for(const f of ROOT){ try{const buf=readFileSync(join(VAULT,f)); local.entries.push({path:f,sha256:createHash('sha256').update(buf).digest('hex'),size:buf.length})}catch{} }

const mb=local.entries.reduce((n,e)=>n+e.size,0)/1048576
console.log(`lokalnie: ${local.entries.length} plików, ${mb.toFixed(1)} MB (pominięte za duże: ${local.skipped.length})`)

const rem=await j('/sync/manifest',{})
console.log(`na .150 : ${rem.body?.entries?.length ?? '?'} plików`)

const plan=await j('/sync/plan',{manifest:local.entries})
const w=plan.body?.wanted ?? []
console.log(`plan    : chce ${w.length}, bez zmian ${plan.body?.unchanged ?? 0}, odrzucone ${(plan.body?.rejected||[]).length}`)
if((plan.body?.rejected||[]).length) console.log('  odrzucone:', JSON.stringify(plan.body.rejected.slice(0,3)))

// --- wysylka ---
const byPath=new Map(local.entries.map(e=>[e.path,e]))
const want=w.map(x=>typeof x==='string'?x:x.path)
let sent=0, conflicts=0, failed=0, bytes=0
const t0=Date.now()
for(let i=0;i<want.length;i++){
  const rel=want[i]; const e=byPath.get(rel); if(!e) continue
  const buf=readFileSync(join(VAULT, rel))
  const r=await j('/sync/file',{path:rel,sha256:e.sha256,contentBase64:buf.toString('base64')})
  if(r.status===200){ sent++; bytes+=buf.length; if(r.body&&r.body.conflict) conflicts++ }
  else { failed++; if(failed<=3) console.log('  BLAD',r.status,rel,JSON.stringify(r.body).slice(0,90)) }
  if(i===0) console.log('  pierwszy plik: HTTP '+r.status)
  if(i%400===0 && i>0) process.stderr.write(`  ${i}/${want.length}`)
}
const secs=((Date.now()-t0)/1000).toFixed(0)
console.log(`
wyslane ${sent}, konfliktow ${conflicts}, bledow ${failed}, ${(bytes/1048576).toFixed(1)} MB w ${secs}s`)
