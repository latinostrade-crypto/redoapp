import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-poker-presence-'));
const port = 34_000 + Math.floor(Math.random() * 800);
const baseUrl = `http://127.0.0.1:${port}`;
const mode = process.argv.includes('--public') ? 'public' : 'free';
await mkdir(path.join(runtimeDir, 'data'));
await writeFile(path.join(runtimeDir, 'data', 'runtime-state.json'), JSON.stringify({users: ['rebuy_one','rebuy_two'].map(userId=>({userId,casinoChips:1000}))}));
let server;
function startServer() { return spawn(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'server.ts')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    APP_SESSION_SECRET: 'poker-presence-lifecycle-test-secret',
    RUNTIME_STATE_DIR: runtimeDir,
    CASINO_TABLES_DB_MODE: 'false', TELEGRAM_BOT_TOKEN: '', TON_API_KEY: '',
  },
  stdio: 'ignore',
  windowsHide: true,
}); }
server = startServer();

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Poker presence test server did not start.');
}

async function request(userId, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'x-user-id': userId,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${options.method || 'GET'} ${endpoint}: ${JSON.stringify(payload)}`);
  return payload;
}


const tableId = 'table-poker-'+mode+'-2';
try {
  await waitForServer();
  for(const userId of ['rebuy_one','rebuy_two']) {
    await request(userId, '/api/casino/join-table', {method:'POST', body:JSON.stringify({tableId,chips:100,idempotencyKey:'join-'+userId})});
  }
  async function reject(userId, key) {
    const response = await fetch(baseUrl+'/api/casino/poker-rebuy',{method:'POST', headers:{'x-user-id':userId,'content-type':'application/json'},body:JSON.stringify({tableId,chips:100,idempotencyKey:key})});
    assert.equal(response.status,409);
  }
  await reject('rebuy_spectator','spectator-denied');
  await reject('rebuy_one','funded-denied');
  let state, loser;
  for(let attempt=0;attempt<80;attempt++) {
    state=(await request('rebuy_one','/api/matches/state/'+tableId)).pokerGameState;
    if(state.stage==='ended') {
      loser=state.players.find(p=>p.chips===0);
      if(loser) break;
    }
    if(['preflop','flop','turn','river'].includes(state.stage)) {
      const current=state.players[state.currentPlayerIndex];
      if(!current.folded && !current.isAllIn) {
        await request(current.userId,'/api/matches/action',{method:'POST',body:JSON.stringify({matchId:tableId,action:'all_in'})});
      }
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(loser,'all-in hands must produce a busted player');
  const before=await request(loser.userId,'/api/me');
  const body=JSON.stringify({tableId,chips:mode==='free'?9999:100,idempotencyKey:'rebuy-repeat-safe'});
  const replies=await Promise.all([1,2,3].map(()=>request(loser.userId,'/api/casino/poker-rebuy',{method:'POST',body})));
  assert.ok(replies.every(r=>r.chips===100&&r.energyCost===(mode==='free'?2:0)));
  const after=await request(loser.userId,'/api/me');
  assert.equal(before.energy.energy-after.energy.energy,mode==='free'?2:0,'energy debit is mode-specific and happens once');
  assert.equal(before.casinoChips-after.casinoChips,mode==='public'?100:0,'chip debit is mode-specific and happens once');
  state=(await request(loser.userId,'/api/matches/state/'+tableId)).pokerGameState;
  assert.equal(state.players.find(p=>p.id==='player').chips,100);
  assert.equal(state.players.find(p=>p.id==='player').rebuyPending,true);
  assert.equal(state.players.length,2,'rebuy preserves seats');
  await reject(loser.userId,'second-rebuy-denied');
  for(let n=0;n<40;n++) {
    state=(await request(loser.userId,'/api/matches/state/'+tableId)).pokerGameState;
    if(state.stage==='preflop') break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.equal(state.stage,'preflop','funded player returns next hand');
  assert.equal(state.players.find(p=>p.id==='player').eliminated,false);
  assert.equal(state.players.find(p=>p.id==='player').rebuyPending,false);
  await request(loser.userId,'/api/casino/poker-rebuy',{method:'POST',body});
  assert.equal((await request(loser.userId,'/api/me')).energy.energy,after.energy.energy,'late replay must not charge again');
  await new Promise(resolve=>setTimeout(resolve,600));
  server.kill('SIGTERM');
  await once(server,'exit');
  const snapshot=JSON.parse(await readFile(path.join(runtimeDir,'data','runtime-state.json'),'utf8'));
  const persistedMatch=snapshot.activeMatches.find(m=>m.matchId===tableId);
  assert.equal(persistedMatch.pokerGameState.players.find(p=>p.userId===loser.userId).tableBuyInChips,200,'original buy-in plus rebuy survives checkpoint');
  server=startServer();await waitForServer();
  await request(loser.userId,'/api/casino/poker-rebuy',{method:'POST',body});
  const restoredProfile=await request(loser.userId,'/api/me');
  assert.equal(restoredProfile.casinoChips,after.casinoChips,'restart replay must not charge chips');
  assert.equal(restoredProfile.energy.energy,after.energy.energy,'restart replay must not charge energy');
  console.log(mode+' poker rebuy API: single energy debit, duplicate requests, spectator rejection, next-hand return passed.');
} finally {
  if (!server.killed) server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  await rm(runtimeDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}
