/**
 * CWI verification-receipt engine (backlog #12 — IG comment-to-DM receipts).
 * Zero dependencies. Runs in Node and in the browser (UMD).
 *
 * Takes a CLAIM (track + placement assertion) and returns a RECEIPT:
 *   - verdict: "verified" | "verified-stale" | "cannot-verify"
 *   - never invents evidence; unknown or conflicting claims produce an
 *     honest "cannot-verify" receipt, never a fake pass.
 *
 * Evidence records: { track, playlist, playlist_id, position, total,
 *   observed_at (ISO-8601), verifier, evidence_url, tier }
 * Tier: "verified" | "unverified-claim" — only "verified" tier records can
 * produce a "verified" verdict.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CWIReceipts = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STALE_AFTER_MS = 48 * 3600 * 1000; // 48h freshness rule
  var MAX_TEXT = 1000; // DM-safe length

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[’‘`]/g, "'").replace(/[^a-z0-9' ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function isISO8601(s) {
    if (typeof s !== 'string' || !s) return false;
    var t = Date.parse(s);
    return !isNaN(t);
  }

  /**
   * Make a receipt for a claim against an evidence store.
   * claim: { track, playlist } (+ optional position, claimed_position)
   * evidence: array of evidence records
   * now: ms epoch (injectable for tests)
   */
  function makeReceipt(claim, evidence, now) {
    now = now || Date.now();
    var track = norm(claim && claim.track);
    var playlist = norm(claim && claim.playlist);

    function base(verdict, extra) {
      var r = {
        receipt_id: 'rcpt-' + Math.random().toString(36).slice(2, 10),
        issued_at: new Date(now).toISOString(),
        verdict: verdict,
        claim: { track: track || null, playlist: playlist || null },
        evidence: null,
        freshness: null,
        reason: null,
      };
      if (extra) for (var k in extra) r[k] = extra[k];
      return r;
    }

    if (!track || !playlist) {
      return base('cannot-verify', {
        reason: 'incomplete-claim: both track and playlist are required',
      });
    }

    var matches = (evidence || []).filter(function (e) {
      return e && e.tier === 'verified'
        && norm(e.track) === track && norm(e.playlist) === playlist
        && isISO8601(e.observed_at);
    });

    if (matches.length === 0) {
      var anyTier = (evidence || []).some(function (e) {
        return e && norm(e.track) === track && norm(e.playlist) === playlist;
      });
      return base('cannot-verify', {
        reason: anyTier
          ? 'unverified-claim: this placement exists as an unverified claim only — no verified evidence on file'
          : 'no-evidence: no verified evidence on file for this track + playlist',
      });
    }

    // Conflict check: same track+playlist, differing verified positions/totals.
    var sigs = {};
    matches.forEach(function (m) {
      sigs[String(m.position) + '/' + String(m.total)] = true;
    });
    if (Object.keys(sigs).length > 1) {
      return base('cannot-verify', {
        reason: 'conflicting-evidence: verified records disagree on position — held until reconciled',
        evidence: matches.map(publicEvidence),
      });
    }

    var ev = matches.slice().sort(function (a, b) {
      return Date.parse(b.observed_at) - Date.parse(a.observed_at);
    })[0];
    var ageMs = now - Date.parse(ev.observed_at);
    var fresh = ageMs >= 0 && ageMs <= STALE_AFTER_MS;

    return base(fresh ? 'verified' : 'verified-stale', {
      evidence: publicEvidence(ev),
      freshness: fresh ? 'fresh' : 'stale',
    });
  }

  function publicEvidence(e) {
    return {
      track: e.track, playlist: e.playlist, playlist_id: e.playlist_id || null,
      position: e.position == null ? null : e.position,
      total: e.total == null ? null : e.total,
      observed_at: e.observed_at, verifier: e.verifier || null,
      evidence_url: e.evidence_url || null, tier: e.tier,
    };
  }

  /** Render a receipt as DM-safe plain text (<=1000 chars), with opt-out. */
  function renderDM(receipt) {
    var lines = [];
    lines.push('CWI verification receipt ' + receipt.receipt_id);
    lines.push('Claim: "' + (receipt.claim.track || '?') + '" on "' + (receipt.claim.playlist || '?') + '"');
    if (receipt.verdict === 'verified' || receipt.verdict === 'verified-stale') {
      var e = receipt.evidence;
      var pos = e.position != null ? '#' + e.position + (e.total != null ? '/' + e.total : '') : 'position n/a';
      lines.push('VERDICT: VERIFIED' + (receipt.verdict === 'verified-stale' ? ' (STALE — evidence older than 48h)' : ''));
      lines.push('Position: ' + pos);
      lines.push('Observed: ' + e.observed_at + ' by ' + (e.verifier || 'CWI'));
      if (e.evidence_url) lines.push('Evidence: ' + e.evidence_url);
    } else {
      lines.push('VERDICT: CANNOT VERIFY');
      lines.push('Reason: ' + (receipt.reason || 'unknown'));
      lines.push('This is CWI\'s verified view as of ' + receipt.issued_at + ' — not a universal authority.');
    }
    lines.push('Reply STOP to opt out of receipts.');
    var text = lines.join('\n');
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + '…' : text;
  }

  return { makeReceipt: makeReceipt, renderDM: renderDM, STALE_AFTER_MS: STALE_AFTER_MS, norm: norm };
}));
