import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';

const read = file => readFileSync(file,'utf8');
const config = parse(read('render.yaml'));
const frontend = config.services.find(service=>service.name==='redoapp');
const backend = config.services.find(service=>service.name==='yoapp-backend-legacy');
assert.equal(frontend.type,'web'); assert.equal(frontend.runtime,'static');
assert.equal(frontend.staticPublishPath,'dist');
assert.match(frontend.buildCommand,/npm ci/);
assert.match(backend.buildCommand,/build:server/);
assert.equal(backend.startCommand,'npm run start:production');
assert.equal(backend.healthCheckPath,'/api/health');
assert.equal(backend.plan,'starter','Do not silently downgrade the existing live instance');
assert.equal(backend.region,'oregon');
const permissions = read('supabase/20260906_backend_only_permissions.sql');
assert.match(permissions, /FROM PUBLIC, anon, authenticated/);
assert.match(permissions, /security_invoker = true/);
assert.match(permissions, /SET LOCAL ROLE service_role/);
const triggerPermissions = read('supabase/20260906_trigger_permissions.sql');
assert.match(triggerPermissions, /FROM PUBLIC, anon, authenticated/);
assert.match(triggerPermissions, /SET search_path = pg_catalog/);
assert.ok(frontend.routes.some(route=>route.source==='/match-api/*' && route.destination.includes('/api/matchmaker/*')));
assert.ok(frontend.headers.some(header=>header.path==='/assets/*' && header.value.includes('immutable')));
assert.ok(!frontend.headers.some(header=>header.path==='/*' && header.name==='Cache-Control' && header.value.includes('immutable')));
for(const service of config.services) for(const entry of service.envVars || []) {
  if(/TOKEN$|SECRET$|SERVICE_ROLE_KEY$|ADMIN_API_KEY$|TON_API_KEY$/.test(entry.key)) assert.equal(entry.sync,false,`Secret ${entry.key} must be supplied by Render, not the repo`);
}
if(process.argv.includes('--schema')) {
  const response=await fetch('https://render.com/schema/render.yaml.json',{signal:AbortSignal.timeout(15000)});
  assert.ok(response.ok,'Could not download official Render schema');
  const schema=await response.json();
  const validate=new Ajv2020({strict:false,allErrors:true,validateFormats:false}).compile(schema);
  assert.ok(validate(config),JSON.stringify(validate.errors,null,2));
  console.log('Official Render JSON Schema validation passed.');
}

const manifest=JSON.parse(read('dist/.vite/manifest.json'));
const entry=Object.values(manifest).find(chunk=>chunk.isEntry && chunk.file.endsWith('.js'));
assert.ok(entry,'Missing Vite entry');
const closure=(chunk,seen=new Set())=>{if(seen.has(chunk.file))return seen; seen.add(chunk.file);for(const key of chunk.imports||[])closure(manifest[key],seen);return seen;};
const story=Object.values(manifest).find(chunk=>chunk.src?.endsWith('/ComicExperience.tsx'));
const game=Object.values(manifest).find(chunk=>chunk.isDynamicEntry && (chunk.src==='src/GameSurface.tsx' || chunk.name==='GameSurface'));
assert.ok(story && game,'Story and game must remain independent dynamic entries');
for(const file of closure(story)) assert.ok(!/wallet-vendor|GameSurface/.test(file),'Story eagerly imports game or wallet');
for(const chunk of Object.values(manifest)) {
  assert.ok(existsSync(`dist/${chunk.file}`),`Missing built asset ${chunk.file}`);
  for(const asset of [...chunk.css||[],...chunk.assets||[]]) assert.ok(existsSync(`dist/${asset}`),`Missing built asset ${asset}`);
}
assert.ok(existsSync('build/server.mjs'),'Build production server first');
const boot=read('src/GameSurface.tsx');
assert.ok(!boot.includes('initializeRequiredGameImages'),'Lobby must not preload the UNO deck');

const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024}).split('\0').filter(Boolean);
const tracked=git('diff','HEAD','--name-only','-z');
const untracked=git('ls-files','--others','--exclude-standard','-z');
const include=file=>/^(src\/|server\/|scripts\/|docs\/|supabase\/)/.test(file)||!file.includes('/');
const paths=[...new Set([...tracked,...untracked.filter(include)])].sort();
const blocked=/^(?:\.env(?!\.example$)|data\/|output\/|dist\/|build\/|node_modules\/|\.playwright-cli\/)|\.(?:pem|key|log)$/i;
const signatures=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /(?:APP_SESSION_SECRET|SUPABASE_SERVICE_ROLE_KEY|TELEGRAM_BOT_TOKEN)\s*=\s*["'][A-Za-z0-9_:/+.-]{24,}["']/m];
const files=[];
for(const file of paths) {
  assert.ok(!blocked.test(file),`Unsafe release path: ${file}`);
  if(!existsSync(file)) {files.push({file,deleted:true});continue;}
  const bytes=readFileSync(file);
  assert.ok(bytes.length<50*1024*1024,`Oversized file needs review: ${file}`);
  if(/\.(?:tsx?|jsx?|mjs|json|ya?ml|md|env|txt|sql)$/.test(file)) for(const signature of signatures) assert.ok(!signature.test(bytes.toString('utf8')),`Possible secret: ${file} (inspect locally, value suppressed)`);
  files.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const sizes=Object.values(manifest).filter(chunk=>chunk.file.endsWith('.js')).map(chunk=>({file:chunk.file,bytes:statSync(`dist/${chunk.file}`).size,gzip:gzipSync(readFileSync(`dist/${chunk.file}`)).length}));
const report={checkedAt:new Date().toISOString(),branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files,excludedUntracked:untracked.filter(file=>!include(file)),javascript:sizes,initialJavascript:[...closure(entry)],storyJavascript:[...closure(story)],gameJavascript:[...closure(game)],officialSchemaChecked:process.argv.includes('--schema'),note:'This checker performs no staging, commit, push, deploy or database changes. Separately authorized live ACL and Blueprint changes are recorded in docs/live-release-audit.md.'};
mkdirSync('output/release',{recursive:true});
writeFileSync('output/release/manifest.json',JSON.stringify(report,null,2));
writeFileSync('output/release/paths.nul',paths.join('\0')+'\0');
writeFileSync('output/release/paths.txt',paths.join('\n')+'\n');
console.log(`Release checks passed; ${files.length} files inventoried, ${report.excludedUntracked.length} reference-only untracked files excluded. Manifest: output/release/manifest.json`);
console.table(sizes);
