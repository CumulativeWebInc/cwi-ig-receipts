# Twenty Minds — IG comment-to-DM verification receipts (#12) build design

**Date:** 2026-09-19. **Decision question:** Build the receipt engine + Messaging-API webhook (tested on simulated payloads) + public demo now, hard-gating live DM sends behind documented account-linking steps — yes or no?

**Pre-run lean:** Yes — full build per the brief, live sends gated.

**Facts (max 5):**
1. Backlog #12: follower comments "PROOF" on a placement post → receives verification receipt by DM; predicted 100–2,000 receipts/mo; kill <25 receipts requested in 60 days.
2. IG DM automation requires the official Messaging API: Business/Creator account + linked Facebook Page + Meta app; comment-to-DM is Meta's sanctioned pattern (one automated DM per post per person).
3. Black's carve-outs: nothing sent from any real account until the linking steps are documented and he taps go — the live path cannot fire today.
4. CWI owns the truth substrate: verified placement records with evidence tiers, observed_at, verifier; the engine must never invent evidence.
5. $0 only; the public demo must be stranger-usable in under a minute.

## Verdicts

1. **Skeptic** — Build it, because the demo is the only part that produces evidence today and the webhook is dead code until accounts link.
   Risk: the "full build" framing lets an untestable webhook masquerade as a shipped product.
2. **Data scientist** — Build it, because the demo page instruments real demand (receipt requests) which the kill rule needs, while the webhook has zero measurable inputs until linking.
   Risk: demo-form submissions are curiosity clicks, not DM requests — the measurement proxy may be weak.
3. **User advocate** — Build the demo first and loudest; the stranger who wants proof of a placement is served by a receipt in under a minute, not by webhook plumbing.
   Risk: the IG follower who comments "PROOF" gets nothing until accounts link — the actual user journey stays broken.
4. **Contrarian** — Don't build the webhook at all; ship the demo only, because Meta's linking prerequisites sit with Black and dead integration code rots.
   Risk: when Black links the accounts, no tested webhook is ready and the lane stalls at its moment of demand.
5. **Engineer** — Build engine + webhook + demo; the webhook is pure functions over webhook payloads, fully testable with fixtures, and the Graph API call is one isolated sender module gated by config.
   Risk: Meta changes payload shapes without notice and the fixtures silently drift from reality.
6. **Economist** — Build all three; the marginal cost of the webhook on top of the engine is small, and it converts a demo into a distribution channel the moment accounts link.
   Risk: effort spent on the webhook is effort not spent on nearer-term receipt lanes.
7. **Security reviewer** — Build, but the webhook must verify X-Hub-Signature-256 and reject unsigned payloads, because an open comment webhook is a spam cannon aimed at our own followers.
   Risk: signature verification is only as good as the secret's storage — document the vault path, never the value.
8. **Child-of-five explainer** — "You write PROOF under our post, we send you the proof in a DM" — build it so that sentence stays true, which means the receipt must be honest even when it says "we can't verify this."
   Risk: the honest "cannot verify" receipt confuses people who expected a yes.
9. **10-year historian** — Build it; in 2036 the record shows CWI shipped verification infrastructure on every major surface, and the receipts lane taught fans to demand proof.
   Risk: historians also record the lanes that shipped plumbing nobody ever connected.
10. **Devil's accountant** — Build all three; true cost is one worker session, zero dollars, and the kill rule caps the downside at 60 days.
    Risk: the hidden cost is maintenance attention — every unconnected webhook is a future "is this still live?" thread.
11. **Field operator** — Build; my worst Tuesday is a spam wave of "PROOF" comments, so the rate limiter (one DM per user per post) and the keyword allowlist are the load-bearing parts, not the receipt prose.
    Risk: rate limiting by sender ID requires storing sender IDs — a small privacy surface to document.
12. **Systems thinker** — Build; the receipt engine is shared substrate (same engine feeds the demo, the webhook, and future WhatsApp/Messenger lanes), so this build compounds.
    Risk: shared-substrate thinking tempts over-generalization — keep the engine claim-shaped, not platform-shaped.
13. **Risk underwriter** — Build, gated: the tail risk is an automated DM that sends a false verification, so the gate that matters is "no DM without an honest receipt object" — including honest cannot-verify receipts.
    Risk: underwriting the DM path ignores the demo path's risk — a demo that looks authoritative but grades on stale data.
14. **Open-source maintainer** — Build in the open; a stranger must be able to read the receipt engine, run the tests, and trust the "cannot verify" path — that's the whole product.
    Risk: open-sourcing the webhook handler publishes our keyword triggers and rate-limit shape for spammers to study.
15. **Negotiator** — Build; Meta's side is fixed (official API, sanctioned pattern) so there's nothing to negotiate — our walk-away is the demo, which needs no one's permission.
    Risk: no walk-away pressure means we may over-invest in pleasing a platform that hasn't agreed to anything.
16. **Time traveler (2036)** — Build; looking back, the receipts lane was the proof-of-demand that justified linking the accounts — the demo's request log was the business case.
    Risk: the traveler may be remembering the lane that never cleared 25 receipts and died on schedule.
17. **First-principles physicist** — Build the engine first because verification is the irreducible fact; transport (DM vs demo page) is just delivery of that fact.
    Risk: physics ignores distribution — a true fact nobody receives is indistinguishable from no fact.
18. **Ethicist** — Build, with the ethics baked in: DMs fire only on the user's keyword action, every DM carries opt-out, never unsolicited — and "cannot verify" must be as easy to send as a pass.
    Risk: even solicited automation normalizes bot DMs from the brand, which some followers will experience as spam.
19. **Competitor analyst** — Build; the strongest competitor answer to "prove it" is a screenshot, and a machine-readable receipt with evidence links is strictly harder to fake — that's the moat.
    Risk: competitors can copy the receipt format in an afternoon; the moat is the verification pipeline behind it, not the DM.
20. **Black's chair** — Build all three at full speed, $0, nothing sent from any real account until the linking steps are documented and he taps go; the demo ships today, the webhook waits for his accounts.
    Risk: "full speed ahead" plus a gated live path creates pressure to fire the DM path before the gate is honestly met.

## Synthesis

- **Decision:** Build the receipt engine + simulated-payload-tested webhook + public demo now, with live DM sends hard-gated behind documented account linking.
- **Why:** the engineer's testable pure functions, the systems thinker's shared substrate (engine feeds demo, webhook, future Messenger/WhatsApp lanes), and Black's chair's gate converged — engine first, transport second, nothing live without the link.
- **Dissent recorded:** the contrarian's strongest minority — an unconnected webhook rots; answered by fixtures + the 60-day kill rule binding it: if accounts never link, the demo is the product and the webhook is archived at kill review.
- **Confidence:** medium-high — fact that would change it: Meta deprecating or restricting comment-to-DM automation.
- **Changed the pre-run lean?** No — the run confirmed the full-gated build and sharpened the engine-first ordering. (Kill-criterion note: one no-change run; a second consecutive no-change run on this decision stream drops to 5 minds.)
