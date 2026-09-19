/**
 * Adversarial tests — IG comment-to-DM verification receipts.
 * node test.js — exit 0 iff every case passes. Green or no ship.
 */
'use strict';
const crypto = require('crypto');
const R = require('./receipt.js');
const W = require('./webhook.js');

const NOW = Date.parse('2026-09-19T08:00:00Z');
const FRESH_TS = new Date(NOW - 3600 * 1000).toISOString(); // 1h ago
const STALE_TS = '2026-09-15T12:00:00Z';                    // >48h ago

const EVIDENCE = [
  { track: 'Zooted Zone', playlist: '360°: The Best Indie Music', playlist_id: '0hsLLFaADDjU54tFqaImFh',
    position: 216, total: 216, observed_at: FRESH_TS, verifier: 'CWI_Data', tier: 'verified',
    evidence_url: 'https://open.spotify.com/playlist/0hsLLFaADDjU54tFqaImFh' },
  { track: 'Shaka Zulu', playlist: 'New Rap Hits',
    position: 21, total: null, observed_at: STALE_TS, verifier: 'CWI_Data', tier: 'verified',
    evidence_url: null },
  { track: 'Zooted Zone', playlist: 'New Rap Hits',
    position: 30, total: null, observed_at: STALE_TS, verifier: 'CWI_Data', tier: 'verified',
    evidence_url: null },
];

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function cfg() {
  return { verifyToken: 'tok', appSecret: 'secret', live: false,
    pageAccessToken: null, pageId: null, keywords: W.DEFAULT_KEYWORDS.slice(),
    evidence: EVIDENCE };
}
function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

console.log('— receipt engine —');
{
  const r = R.makeReceipt({ track: 'Zooted Zone', playlist: '360°: The Best Indie Music' }, EVIDENCE, NOW);
  t('verified claim -> verified verdict with evidence link', r.verdict === 'verified' && r.evidence && !!r.evidence.evidence_url, JSON.stringify(r.verdict));
}
{
  const r = R.makeReceipt({ track: 'Zooted Zone', playlist: 'Totally Made-Up Playlist' }, EVIDENCE, NOW);
  t('invented placement -> cannot-verify, no fabricated evidence', r.verdict === 'cannot-verify' && r.evidence === null && /no-evidence/.test(r.reason), r.reason);
}
{
  const r = R.makeReceipt({ track: 'Nonexistent Track', playlist: 'New Rap Hits' }, EVIDENCE, NOW);
  t('unknown track -> cannot-verify', r.verdict === 'cannot-verify' && r.evidence === null);
}
{
  const r = R.makeReceipt({ track: 'Shaka Zulu', playlist: 'New Rap Hits' }, EVIDENCE, NOW);
  t('stale evidence -> verified-stale, honestly labeled', r.verdict === 'verified-stale' && r.freshness === 'stale');
}
{
  const conflictEv = EVIDENCE.concat([{ track: 'Zooted Zone', playlist: 'New Rap Hits', position: 99, total: null,
    observed_at: FRESH_TS, verifier: 'CWI_Data', tier: 'verified' }]);
  const r = R.makeReceipt({ track: 'Zooted Zone', playlist: 'New Rap Hits' }, conflictEv, NOW);
  t('conflicting verified positions -> cannot-verify (never pick a side)', r.verdict === 'cannot-verify' && /conflicting/.test(r.reason), r.verdict);
}
{
  const r = R.makeReceipt({ track: 'Zooted Zone' }, EVIDENCE, NOW);
  t('incomplete claim -> cannot-verify, never guessed', r.verdict === 'cannot-verify' && /incomplete/.test(r.reason));
}
{
  const r = R.makeReceipt({ track: 'Zooted Zone', playlist: '360°: The Best Indie Music' }, EVIDENCE, NOW);
  const dm = R.renderDM(r);
  t('DM text <=1000 chars, carries opt-out', dm.length <= 1000 && /STOP/.test(dm) && /VERIFIED/.test(dm));
}
{
  const r = R.makeReceipt({ track: 'Fake', playlist: 'Fake' }, EVIDENCE, NOW);
  const dm = R.renderDM(r);
  t('cannot-verify DM says so plainly', /CANNOT VERIFY/.test(dm) && !/VERIFIED\b/.test(dm.split('CANNOT')[0]));
}
{
  const badEv = [{ track: 'Zooted Zone', playlist: '360 Indie', position: 1, observed_at: 'not-a-date', tier: 'verified' }];
  const r = R.makeReceipt({ track: 'Zooted Zone', playlist: '360 Indie' }, badEv, NOW);
  t('malformed observed_at -> not treated as verified evidence', r.verdict === 'cannot-verify');
}

console.log('— webhook —');
{
  const ok = W.verifySignature(Buffer.from('{}'), sign('{}', 'secret'), 'secret');
  t('valid signature verifies', ok === true);
}
{
  const bad = W.verifySignature(Buffer.from('{}'), sign('{}', 'wrong'), 'secret');
  t('wrong secret -> rejected', bad === false);
}
{
  const missing = W.verifySignature(Buffer.from('{}'), null, 'secret');
  t('missing signature header -> rejected', missing === false);
}
{
  t('keyword hit: "PROOF: X on Y"', W.keywordHit('PROOF: Zooted Zone on 360', W.DEFAULT_KEYWORDS));
  t('no keyword -> no hit', !W.keywordHit('love this track!!', W.DEFAULT_KEYWORDS));
}
{
  const c = W.parseClaim('PROOF: Zooted Zone on 360°: The Best Indie Music', W.DEFAULT_KEYWORDS);
  t('claim parsed from keyword comment', c && c.track === 'Zooted Zone' && /360/.test(c.playlist), JSON.stringify(c));
}
{
  const c = W.parseClaim('PROOF!!!', W.DEFAULT_KEYWORDS);
  t('unparseable claim -> null (never guessed)', c === null);
}
{
  const st = W.makeState(), c = cfg();
  const e1 = { commenterId: 'u1', username: 'fan', mediaId: 'm1', text: 'PROOF: Zooted Zone on 360°: The Best Indie Music' };
  const d1 = W.decide(e1, c, st, R, NOW);
  t('keyword comment -> dm-receipt action with honest receipt', d1.action === 'dm-receipt' && d1.receipt && d1.receipt.verdict === 'verified', d1.action);
  W.markSent(st, 'u1', 'm1', NOW);
  const d2 = W.decide(e1, c, st, R, NOW + 1000);
  t('duplicate user+post -> rate-limited, no second DM', d2.action === 'ignore' && /one-receipt/.test(d2.reason), d2.action);
}
{
  const st = W.makeState(), c = cfg();
  const d = W.decide({ commenterId: 'u9', username: 'x', mediaId: 'm1', text: 'PROOF: Fake Track on Fake Playlist' }, c, st, R, NOW);
  t('invented claim via DM path -> honest cannot-verify receipt, still sendable', d.action === 'dm-receipt' && d.receipt.verdict === 'cannot-verify');
}
{
  const st = W.makeState(), c = cfg();
  const d = W.decide({ commenterId: 'u9', username: 'x', mediaId: 'm1', text: 'nice song' }, c, st, R, NOW);
  t('no keyword -> ignored, DM never considered', d.action === 'ignore');
}
{
  const st = W.makeState(), c = cfg();
  W.decide({ commenterId: 'u5', username: 'x', mediaId: 'm1', text: 'STOP' }, c, st, R, NOW);
  const d = W.decide({ commenterId: 'u5', username: 'x', mediaId: 'm1', text: 'PROOF: Zooted Zone on 360' }, c, st, R, NOW);
  t('STOP opt-out honored on later keyword', d.action === 'ignore' && d.reason === 'opted-out');
}
{
  // Gate: sendDM must refuse without live config.
  W.sendDM(cfg(), 'u1', 'hi').then(
    () => t('sendDM without live config -> refused', false),
    e => t('sendDM without live config -> refused', /live-gate/.test(e.message), e.message));
}
{
  // Malformed payload: handlePayload must not throw.
  const st = W.makeState(), c = cfg();
  W.handlePayload({ entry: [{ changes: [{ field: 'comments', value: null }] }] }, c, st, R)
    .then(o => t('malformed change value -> skipped, no crash', Array.isArray(o)));
  W.handlePayload(null, c, st, R)
    .then(o => t('null payload -> empty outcomes, no crash', Array.isArray(o) && o.length === 0));
}
{
  // Unknown event type ignored.
  const st = W.makeState(), c = cfg();
  const payload = { entry: [{ id: 'm1', changes: [{ field: 'likes', value: { verb: 'add', from: { id: 'u1' }, text: 'PROOF: x on y' } }] }] };
  W.handlePayload(payload, c, st, R).then(o =>
    t('non-comment field -> ignored', o.length === 0));
}
{
  // Dry-run: keyword comment produces dry-run outcome, never a live send.
  const st = W.makeState(), c = cfg();
  const payload = { entry: [{ id: 'm1', changes: [{ field: 'comments', value: {
    verb: 'add', from: { id: 'u7', username: 'fan7' },
    media: { id: 'm1' }, text: 'PROOF: Zooted Zone on 360°: The Best Indie Music' } }] }] };
  W.handlePayload(payload, c, st, R).then(o =>
    t('dry-run mode -> dry-run outcome, no DM sent', o.length === 1 && o[0].action === 'dry-run' && o[0].verdict === 'verified', JSON.stringify(o)));
}

setTimeout(() => {
  console.log('\n' + pass + '/' + (pass + fail) + ' green');
  process.exit(fail ? 1 : 0);
}, 300);
