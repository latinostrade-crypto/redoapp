import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { gameMessages } from '../src/i18n/gameMessages';
import { dashboardMessages } from '../src/i18n/dashboardMessages';
import { noticeMessages } from '../src/i18n/noticeMessages';
import { translateTableEvent } from '../src/i18n/tableEvent';
import { questMessageKeys } from '../src/i18n/questMessages';
import { i18n } from '../src/i18n/instance';
import { message, renderUiMessage } from '../src/i18n/message';
import { describePokerHand } from '../src/i18n/pokerHand';
import { evaluate5CardHand } from '../src/utils/pokerEvaluator';
import type { PokerCard } from '../src/types/poker';
import '../src/i18n/registerGame';

const parameters = (text: string) => [...text.matchAll(/{{\s*([^}]+)\s*}}/g)].map(match => match[1].trim()).sort();
for (const key of Object.keys(noticeMessages)) assert.ok(!(key in dashboardMessages), `Catalog key collision: ${key}`);
function checkSource(directory: string) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) { checkSource(file); continue; }
    if (!file.endsWith('.tsx')) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const checkKey = (node: ts.Expression) => {
      if (ts.isStringLiteral(node)) assert.ok(node.text in gameMessages, `${file}: unknown message ID ${node.text}`);
      if (ts.isConditionalExpression(node)) { checkKey(node.whenTrue); checkKey(node.whenFalse); }
    };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'tr' && node.arguments[0]) checkKey(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}
checkSource('src');
for (const [key, [en, ru]] of Object.entries(gameMessages)) {
  assert.ok(en.trim() && ru.trim(), `Empty translation: ${key}`);
  assert.deepEqual(parameters(en), parameters(ru), `Interpolation mismatch: ${key}`);
  for (const language of ['en', 'ru']) {
    assert.ok(i18n.exists(key, { lng: language, ns: 'game' }), `Missing ${language}:${key}`);
  }
}
for (const keys of Object.values(questMessageKeys)) {
  for (const key of keys) assert.ok(key in gameMessages, `Unknown quest key: ${key}`);
}

await i18n.changeLanguage('ru');
const translateGame = (id: keyof typeof gameMessages, values?: Record<string, string | number>) => String(i18n.t(id, { ...values, ns: 'game' }));
assert.equal(translateTableEvent('All opponents folded. AbC_19 wins pot of 42 chips!', translateGame), 'Все соперники сделали FOLD. AbC_19 выигрывает банк: 42 фишек!');
assert.equal(translateTableEvent('Pair of Kings', translateGame), 'Пара: K');
assert.equal(translateTableEvent('RARE DROP! +0.50 TKT added to your balance.', translateGame), 'РЕДКАЯ НАГРАДА! На баланс зачислено +0.50 TKT.');
assert.equal(translateTableEvent('AbC_19 hits', translateGame), 'AbC_19: HIT');
const cards = (ranks: number[]): PokerCard[] => ranks.map((rank, index) => ({ id: String(index), rank, suit: index % 2 ? 'hearts' : 'spades' }));
const wheel = evaluate5CardHand(cards([14, 2, 3, 4, 5]));
const wheelBefore = JSON.stringify(wheel);
assert.equal(describePokerHand(wheel, translateGame), 'Стрит, старшая карта: 5');
assert.equal(JSON.stringify(wheel), wheelBefore, 'Presentation must not mutate the evaluated hand');
assert.equal(describePokerHand(evaluate5CardHand(cards([13, 13, 13, 14, 14])), translateGame), 'Фулл-хаус: K и A');
const openNotice = message('reservePrivateJoin', { stake: 0.5, game: 'POKER' });
const renderNotice = () => renderUiMessage(openNotice, (id, values) => String(i18n.t(id, { ...values, ns: 'game' })));
assert.equal(renderNotice(), 'Зарезервировать 0.5 TKT для входа за приватный стол POKER?');
const externalMessage = 'User AbC_19: unknown server error';
assert.equal(renderUiMessage(externalMessage, () => { throw new Error('External text must not be dictionary-translated'); }), externalMessage);
for (const [count, noun] of [[1, 'задание'], [2, 'задания'], [5, 'заданий'], [21, 'задание'], [22, 'задания'], [25, 'заданий']] as const) {
  assert.equal(i18n.t('moreMissions', { ns: 'game', count }), `+ Ещё ${count} ${noun}`);
}
assert.equal(i18n.t('connectedRoom', { ns: 'game', code: 'AbC_19' }), 'Вы подключены к комнате №AbC_19! Стол запустится автоматически, когда все места будут заняты.');
assert.equal(i18n.t('ENTRY: 2 ENERGY · 100 PLAY CHIPS'), 'ВХОД: 2 ЭНЕРГИИ · 100 ИГРОВЫХ ФИШЕК');
await i18n.changeLanguage('en');
assert.equal(renderNotice(), 'Reserve 0.5 TKT to join this private POKER table?');
assert.equal(i18n.t('moreMissions', { ns: 'game', count: 1 }), '+ 1 more mission');
assert.equal(i18n.t('moreMissions', { ns: 'game', count: 5 }), '+ 5 more missions');
assert.equal(i18n.t('connectedRoom', { ns: 'game', code: 'AbC_19' }), 'Connected to Room #AbC_19! The table starts automatically when all seats are filled.');

const unchangedActions = new Set(['CALL', 'FOLD', 'CHECK', 'RAISE', 'BET', 'ALL-IN', 'HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER', 'INSURE']);
for (const [key, [en, ru]] of Object.entries(gameMessages)) {
  if (unchangedActions.has(en)) assert.equal(en, ru, `Card action translated: ${key}`);
}
console.log(`Localization catalogs: ${Object.keys(gameMessages).length} messages; parameters, Russian plurals, quest IDs and EN/RU round-trip passed.`);
