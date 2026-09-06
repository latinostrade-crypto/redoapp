import { spawnSync } from 'node:child_process';

// Never use production keys for integration tests. Each test owns its local
// temporary database/state and port; external integrations are disabled here.
const env={...process.env,REDOAPP_TEST_COMPILED:'1',TELEGRAM_BOT_TOKEN:'',TON_API_KEY:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',CASINO_TABLES_DB_MODE:'false',ENABLE_CHAIN_VERIFICATION:'false'};
const commands=['lint','test:localization','build','build:server','test:traffic','test:sse-budget','test:persistence-budget','test:game-routing','test:private-room-client','test:poker-chips','test:poker-motion','test:poker-reactions','test:match-emoji','test:poker-pre-actions','test:poker-side-pots','test:poker-resilience','test:blackjack-rules','test:daily-vault','test:poker-cashout-referrals','test:ticket-accounting','test:pvp-handoff','test:multiplayer-rooms','test:casino-restart','test:production-auth','check:release'];
for(const name of commands) {
  console.log(`\nRelease gate: ${name}`);
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',name],{stdio:'inherit',env,shell:process.platform==='win32',windowsHide:true});
  if(result.error || result.status!==0) {console.error(`Release preparation stopped at ${name}. Nothing was committed or pushed.`);process.exit(result.status||1);}
}
console.log('Local release gates passed. Review output/release/manifest.json and docs/release-preparation.md before staging.');
