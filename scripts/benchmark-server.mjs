import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();
const results=[];
for(const mode of ['tsx','compiled']) {
  const port=37000+Math.floor(Math.random()*1000), base=`http://127.0.0.1:${port}`;
  const admin=crypto.randomBytes(24).toString('hex');
  const dir=path.join(root,'output','release',`bench-${mode}-${crypto.randomUUID()}`);
  await mkdir(dir,{recursive:true});
  // Use one Node process in both cases so cleanup cannot orphan a CLI child.
  const args=mode==='compiled'?[path.join(root,'build/server.mjs')]:['--import','tsx',path.join(root,'server.ts')];
  const started=performance.now();
  const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,NODE_ENV:'development',PORT:String(port),RUNTIME_STATE_DIR:dir,APP_SESSION_SECRET:crypto.randomBytes(32).toString('hex'),ADMIN_API_KEY:admin,TELEGRAM_BOT_TOKEN:'',TON_API_KEY:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',ENABLE_CHAIN_VERIFICATION:'false',CASINO_TABLES_DB_MODE:'false'}});
  try {
    let ready=false;
    while(performance.now()-started<15000) {
      if(child.exitCode!==null)throw Error(`Benchmark ${mode} exited before readiness`);
      try {if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,'Isolated backend not ready');
    const readinessMs=Math.round(performance.now()-started);
    const adminHealth=async()=>{const response=await fetch(base+'/api/admin/health',{headers:{'x-admin-api-key':admin}});assert.ok(response.ok);return response.json();};
    const before=await adminHealth(), durations=[];
    const loadStart=performance.now();
    // Stay below the real IP limiter; a benchmark must not weaken protection.
    for(let batch=0;batch<6;batch++)await Promise.all(Array.from({length:10},async()=>{const start=performance.now();const response=await fetch(base+'/api/health');assert.ok(response.ok,`Health returned ${response.status}`);await response.json();durations.push(performance.now()-start);}));
    const elapsed=performance.now()-loadStart, after=await adminHealth();
    durations.sort((a,b)=>a-b);
    results.push({mode,readinessMs,requests:durations.length,concurrency:10,wallMs:Math.round(elapsed),p95Ms:+durations[Math.floor(durations.length*.95)].toFixed(2),rssMiB:+(after.process.memory.rss/1024/1024).toFixed(2),cpuMs:+((after.process.cpu.user+after.process.cpu.system-before.process.cpu.user-before.process.cpu.system)/1000).toFixed(2)});
  } finally {
    if(child.exitCode===null && child.signalCode===null) {
      const closed=new Promise(resolve=>child.once('close',resolve));
      child.kill();
      await closed;
    }
  }
}
await writeFile('output/release/server-benchmark.json',JSON.stringify({note:'Local synthetic health-only smoke, one sample per runtime; not Render capacity or gameplay load. Baseline uses node --import tsx; both runtimes are single processes.',results},null,2));
console.table(results);
