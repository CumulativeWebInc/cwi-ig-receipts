# Kill rule — IG comment-to-DM verification receipts

**Lane:** backlog #12 · **Window opened:** 2026-09-19 · **Kill date:** 2026-11-18 (60 days)
**Rule:** fewer than 25 receipts requested in 60 days → kill the lane.
**Measure:** demo-page receipt requests (counted on the demo) + live DM receipts
once account linking completes. Checkpoints at 50% (2026-10-19) and 75%
(2026-11-03) per the in-between protocol.

## Log

- 2026-09-19 — Lane opened. Twenty Minds verdict: build engine + sim-tested
  webhook + public demo, live DMs hard-gated on account linking. Tests 26/26
  green. Demo deployed; webhook in DRY-RUN until ACCOUNT-LINKING.md completes.
  Receipts requested: 0.
