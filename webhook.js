/**
 * IG comment-to-DM receipt webhook (backlog #12). Node, zero dependencies.
 *
 * Flow: Meta posts comment events -> keyword match ("PROOF" et al.) ->
 *   honest receipt via the receipt engine -> one DM per user per post.
 *
 * LIVE MODE IS HARD-GATED: DMs are only sent when config.live === true AND
 * a page access token is present. Until Black completes ACCOUNT-LINKING.md
 * and taps go, the server runs in DRY-RUN (logs what it would send).
 *
 * Security: every POST must carry a valid X-Hub-Signature-256 (HMAC-SHA256
 * of the raw body with the app secret). Unsigned/mismatched -> 403.
 * Rate limits: one receipt DM per (commenter, media) per RATE_WINDOW_MS;
 * max MAX_DMS_PER_MEDIA_PER_HOUR per media. Opt-outs ("STOP") are honored.
 *
 * Usage: node webhook.js [--port 8787] [--live] [--config config.json]
 * Test-only import: require('./webhook.js') exposes handleEvent etc.
 *   without binding a port (guarded by require.main check).
 */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

let RECEIPTS = null;
try { RECEIPTS = require('./receipt.js'); }
catch (e) { RECEIPTS = null; } // browser-free contexts; engine injected in tests

const DEFAULT_KEYWORDS = ['proof', 'verify', 'receipt', 'prove it', 'verified?'];
const RATE_WINDOW_MS = 24 * 3600 * 1000;
const MAX_DMS_PER_MEDIA_PER_HOUR = 50;

function loadConfig(argv) {
  const cfg = {
    port: 8787, live: false, verifyToken: null, appSecret: null,
    pageAccessToken: null, pageId: null,
    keywords: DEFAULT_KEYWORDS.slice(),
    evidence: [], // verified evidence store (see receipt.js)
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') cfg.port = parseInt(argv[++i], 10) || 8787;
    if (argv[i] === '--live') cfg.live = true;
    if (argv[i] === '--config') {
      const extra = JSON.parse(fs.readFileSync(argv[++i], 'utf8'));
      Object.assign(cfg, extra);
    }
  }
  // Env overrides (never commit secrets; store page token in the Secure Vault).
  if (process.env.CWI_IG_VERIFY_TOKEN) cfg.verifyToken = process.env.CWI_IG_VERIFY_TOKEN;
  if (process.env.CWI_IG_APP_SECRET) cfg.appSecret = process.env.CWI_IG_APP_SECRET;
  if (process.env.CWI_IG_PAGE_TOKEN) cfg.pageAccessToken = process.env.CWI_IG_PAGE_TOKEN;
  if (process.env.CWI_IG_PAGE_ID) cfg.pageId = process.env.CWI_IG_PAGE_ID;
  return cfg;
}

/** In-memory state: rate limits + opt-outs. Production needs a durable store. */
function makeState() {
  return {
    sentKeys: new Map(),        // "commenterId:mediaId" -> timestamp
    mediaCounts: new Map(),     // mediaId -> [timestamps]
    optOuts: new Set(),         // commenter ids
  };
}

function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !appSecret) return false;
  const m = /^sha256=(.+)$/.exec(signatureHeader);
  if (!m) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(m[1], 'hex'), b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function keywordHit(text, keywords) {
  const t = String(text || '');
  return keywords.some(k => {
    const esc = String(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)', 'i').test(t);
  });
}

/** Extract a claim {track, playlist} from comment text after the keyword.
 *  Expected shape: "PROOF: Zooted Zone on Eric Alper 360" — best-effort;
 *  unparseable -> null (caller then asks for clarification, never guesses). */
function parseClaim(text, keywords) {
  const lower = String(text || '').toLowerCase();
  let rest = String(text || '');
  for (const k of keywords) {
    const i = lower.indexOf(k.toLowerCase());
    if (i !== -1) { rest = String(text || '').slice(i + k.length); break; }
  }
  rest = rest.replace(/^[:\s\-–—]+/, '').trim();
  // "Track on Playlist" / "Track — Playlist"
  const m = /^(.+?)\s+(?:on|—|–|-|\|)\s+(.+)$/.exec(rest);
  if (!m) return null;
  const track = m[1].trim(), playlist = m[2].trim();
  if (!track || !playlist || track.length > 120 || playlist.length > 120) return null;
  return { track, playlist };
}

function rateLimited(state, commenterId, mediaId, now) {
  now = now || Date.now();
  const key = commenterId + ':' + mediaId;
  const last = state.sentKeys.get(key);
  if (last && now - last < RATE_WINDOW_MS) return { limited: true, reason: 'one-receipt-per-user-per-post' };
  const stamps = (state.mediaCounts.get(mediaId) || []).filter(t => now - t < 3600 * 1000);
  if (stamps.length >= MAX_DMS_PER_MEDIA_PER_HOUR) return { limited: true, reason: 'media-hourly-cap' };
  return { limited: false };
}

function markSent(state, commenterId, mediaId, now) {
  now = now || Date.now();
  state.sentKeys.set(commenterId + ':' + mediaId, now);
  const arr = state.mediaCounts.get(mediaId) || [];
  arr.push(now);
  state.mediaCounts.set(mediaId, arr);
}

/** Core decision: comment event -> action. Pure; fully testable.
 *  event: { commenterId, username, mediaId, text }
 *  Returns { action: 'dm-receipt'|'ask-clarify'|'ignore'|'opt-out-recorded', ... } */
function decide(event, cfg, state, engine, now) {
  now = now || Date.now();
  const text = String(event.text || '');
  if (/^\s*stop\s*$/i.test(text)) {
    state.optOuts.add(event.commenterId);
    return { action: 'opt-out-recorded' };
  }
  if (state.optOuts.has(event.commenterId)) return { action: 'ignore', reason: 'opted-out' };
  if (!keywordHit(text, cfg.keywords)) return { action: 'ignore', reason: 'no-keyword' };
  const claim = parseClaim(text, cfg.keywords);
  if (!claim) {
    return {
      action: 'ask-clarify',
      reply: '@' + (event.username || 'there') + ' — to get your verification receipt, comment: PROOF: <track> on <playlist>',
    };
  }
  const rl = rateLimited(state, event.commenterId, event.mediaId, now);
  if (rl.limited) return { action: 'ignore', reason: rl.reason };
  const receipt = engine.makeReceipt(claim, cfg.evidence, now);
  const dmText = engine.renderDM(receipt);
  return { action: 'dm-receipt', claim, receipt, dmText, claim };
}

/** Send one DM via the Graph API. Only called when cfg.live is true. */
function sendDM(cfg, recipientId, text) {
  return new Promise((resolve, reject) => {
    if (!cfg.live || !cfg.pageAccessToken || !cfg.pageId) {
      return reject(new Error('live-gate: DMs require --live and a page access token (see ACCOUNT-LINKING.md)'));
    }
    const body = JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text },
    });
    const req = require('https').request({
      hostname: 'graph.facebook.com', path: '/v21.0/' + cfg.pageId + '/messages?access_token=' + encodeURIComponent(cfg.pageAccessToken),
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => res.statusCode >= 200 && res.statusCode < 300
        ? resolve(JSON.parse(data || '{}')) : reject(new Error('graph-api:' + res.statusCode + ' ' + data)));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

/** HTTP server. Exported pieces keep the request path testable. */
function createServer(cfg, state, engine) {
  engine = engine || RECEIPTS;
  if (!engine) throw new Error('receipt engine required');
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    // Meta webhook verification handshake
    if (req.method === 'GET' && url.pathname === '/webhook') {
      if (url.searchParams.get('hub.mode') === 'subscribe' &&
          url.searchParams.get('hub.verify_token') === cfg.verifyToken) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(url.searchParams.get('hub.challenge') || '');
      }
      res.writeHead(403); return res.end('forbidden');
    }
    if (req.method !== 'POST' || url.pathname !== '/webhook') {
      res.writeHead(404); return res.end('not found');
    }
    let raw = Buffer.alloc(0);
    req.on('data', c => raw = Buffer.concat([raw, c]));
    req.on('end', async () => {
      if (!verifySignature(raw, req.headers['x-hub-signature-256'], cfg.appSecret)) {
        res.writeHead(403); return res.end('bad signature');
      }
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); }
      catch (e) { res.writeHead(400); return res.end('malformed'); }
      try {
        const outcomes = await handlePayload(payload, cfg, state, engine);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, outcomes }));
      } catch (e) {
        res.writeHead(500); res.end('handler error');
      }
    });
  });
}

/** Walk a Meta webhook payload; comment-add events with keywords -> receipts. */
async function handlePayload(payload, cfg, state, engine) {
  const outcomes = [];
  const entries = (payload && payload.entry) || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      if (change.field !== 'comments' || !change.value) continue;
      const v = change.value;
      if (v.verb && v.verb !== 'add' && v.verb !== 'created') continue;
      const event = {
        commenterId: String((v.from && v.from.id) || v.sender_id || 'unknown'),
        username: (v.from && v.from.username) || 'there',
        mediaId: String(v.media && v.media.id || v.media_id || entry.id || 'unknown'),
        text: v.text || v.comment || '',
      };
      if (event.commenterId === 'unknown') { outcomes.push({ action: 'ignore', reason: 'no-sender' }); continue; }
      const d = decide(event, cfg, state, engine);
      if (d.action === 'dm-receipt') {
        if (cfg.live && cfg.pageAccessToken) {
          await sendDM(cfg, event.commenterId, d.dmText);
          markSent(state, event.commenterId, event.mediaId);
          outcomes.push({ action: 'dm-sent', receipt: d.receipt.receipt_id, verdict: d.receipt.verdict });
        } else {
          outcomes.push({ action: 'dry-run', receipt: d.receipt.receipt_id, verdict: d.receipt.verdict, dmText: d.dmText });
        }
      } else if (d.action === 'ask-clarify') {
        outcomes.push({ action: 'clarify', reply: d.reply });
      } else {
        outcomes.push({ action: d.action, reason: d.reason || null });
      }
    }
  }
  return outcomes;
}

module.exports = {
  loadConfig, makeState, verifySignature, keywordHit, parseClaim,
  rateLimited, markSent, decide, handlePayload, createServer, sendDM,
  DEFAULT_KEYWORDS,
};

if (require.main === module) {
  const cfg = loadConfig(process.argv.slice(2));
  const state = makeState();
  const server = createServer(cfg, state, RECEIPTS);
  server.listen(cfg.port, () => {
    console.log('ig-receipts webhook on :' + cfg.port +
      ' mode=' + (cfg.live && cfg.pageAccessToken ? 'LIVE' : 'DRY-RUN (see ACCOUNT-LINKING.md)'));
  });
}
