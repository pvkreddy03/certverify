# Phase 8 recovery and draft PR publication

Branch: `feat/phase-8-hosted-testing-preparation`, stacked on Stage 7
`573d511d23949c3a112c9e75f789c081bacee1cf`. Original Phase 8 commit `16e0e83`
is retained as an ancestor. The continuation adds staging/isolation code; never reset
this branch to Stage 7 or recreate earlier features.

Outside-checkout artifacts in the Cloud workspace:
- `/workspace/certverify-phase8-recovery.bundle` — current full Phase 8 commit chain,
  requiring only the published Stage 7 base.
- `/workspace/certverify-phase8-review.patch` — reviewable mail patch for the same chain.
- `/workspace/certverify-phase8-draft-pr.md` — draft PR body; no remote PR exists yet.
- `/workspace/certverify-phase8-artifacts.sha256` — artifact checksums.

Retain/download these artifacts before replacing the environment; persistence across
unrelated environments is not guaranteed. Do not put environment files, private SQL
inspection reports or keys into recovery artifacts.

Recovery for another Cloud agent (no owner laptop software required):
1. Inspect existing branch/history and dirty files first. Preserve them; no reset/clean.
2. Ensure the Stage 7 base object exists in the checkout; fetch its branch only if needed.
3. Verify the retained bundle with `git bundle verify` and its saved SHA256.
4. Fetch its feature ref into a **new** local recovery ref; do not force-update an
   existing feature branch. For example:
   `git fetch /workspace/certverify-phase8-recovery.bundle refs/heads/feat/phase-8-hosted-testing-preparation:refs/heads/recovered-phase8`
5. Confirm `16e0e83` and `573d511` are ancestors of that recovered ref, then switch only
   after preserving any dirty working tree. Use the recovered source once, not both
   bundle and patch. The patch is an alternative/review artifact, not additional changes.
6. Read checkpoint/handoff, verify actual provider isolation/approvals, and resume
   remaining hosted checks rather than rerunning unchanged successful suites.

Publication gate: Git push/PR creation may trigger existing Vercel Preview deployments
with source credentials. A failed-safe build guard is defense in depth, **not** permission
to bypass the owner's publication gate. First verify either branch auto-deployment is
safely disabled or staging-only Preview credentials are effective and Preview deployment
is authorized. Preserve Production values and old PRs. Then push this branch without
force, query for an existing PR with this head, and create/update exactly one **draft**
PR targeting `feat/stage-7-integration-readiness`, not main. Use the prepared multiline
body through a file or structured GitHub argument. Inspect CI for that exact new head.

Current remote evidence: Stage 7 PR #10 CI passed at `573d511`. Phase 8 has complete
local validation but **no published CI, draft PR or verified isolated preview URL**.


Publication authorization update: the owner confirms staging exists and scopes are split,
and explicitly permits the feature push/automatic Preview when the strengthened guard
fails closed. Publish after final checks; missing flags/invalid secrets may produce a safe
failed Preview. Migration/admin grant/Production approval remain separate. Current procedure
is `docs/phase-8-live-staging-handoff.md`; earlier publication hold is historical context.
