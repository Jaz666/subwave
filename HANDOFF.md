# SUB/WAVE session handoff protocol

Use this at the **start and end of every development session**. It keeps work
resumable without turning every chat into a history dump.

Start with [`STARTHERE.md`](STARTHERE.md), then load only the scoped briefing
for the current task.

## Start of session

1. State the chosen scope: for example *Producer Routing*, *FunctionGemma
   training*, *broadcast timing*, or *web/admin*.
2. Confirm the worktree and branch before editing. Development belongs in
   `/home/jaz666/codex/`; `/home/jaz666/Docker/subwave` is the integration
   station, not the default editing location.
3. Read one current record for that scope — a ledger, workflow guide, or
   handover — plus the relevant code guidance.
4. Inspect the branch status, last commit and any uncommitted changes before
   assuming a previous task is complete.
5. State the smallest useful outcome for this session. Do not load unrelated
   branch histories unless the work actually crosses that boundary.

## During the session

- Keep enduring decisions in the relevant maintained document, not solely in
  chat history or terminal output.
- Keep experimental evidence with its owning branch; use the common documents
  only for project-wide policy and navigation.
- Do not expose or commit `.env`, state data, databases, model artifacts,
  tokens or other runtime secrets.
- Treat a station deployment as separate from a source change: record the
  candidate, evidence, current route and rollback before changing it.

## End of session

Before ending, complete this checklist:

1. **Working tree:** commit and push completed work, or state exactly why it is
   intentionally left uncommitted. Never leave unknown changes behind.
2. **Verification:** record the focused checks actually run and their result;
   distinguish tests not run from tests passed.
3. **Documentation:** update the scoped ledger/guide if the session made a
   durable decision, changed a contract, rejected a candidate or altered a
   workflow. Do not create a new handover file for ordinary implementation.
4. **Operational state:** if the test station was touched, record the active
   candidate, how it is reached, what remains the rollback, and whether any
   source change has been merged into the station checkout.
5. **Next action:** leave one precise next step, including the target worktree
   and, where useful, the next command or acceptance gate.

## Handoff summary template

Use this compact structure in the final response and in a scoped handover when
one is warranted:

```text
Scope: <one development angle>
Branch/worktree: <branch> — <absolute worktree path>
Completed: <commit(s) and outcome>
Verified: <checks and results; explicitly name anything not run>
Station state: <unchanged, or candidate / route / rollback>
Next: <one exact action and its gate>
```

A scoped handover should only be updated when it adds a decision that a later
chat must know. The current common sources are:

- Project map and context routing: [`STARTHERE.md`](STARTHERE.md)
- FunctionGemma experiment record: the FunctionGemma worktree's
  `docs/internals/functiongemma-experiment-ledger.md`
- FunctionGemma terminal procedure: the FunctionGemma worktree's
  `docs/internals/functiongemma-training-workflow.md`
- Test-station integration evidence: `test-station/producer-routing-v21`

## Definition of a clean handoff

The next chat can identify the right worktree, understand what changed, know
what was verified, and continue with one command or decision — without
replaying the previous chat or guessing about live-station safety.
