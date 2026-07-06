# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a
potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created |
DECLINED = user decided not to pursue

---

## 2026-07-05

### Observation 1: Scope-confirmation before large mock/data refactor

**Date:** 2026-07-05
**Session context:** User asked to "apply improvements and update mocks" in an Angular ERP repo, referencing an attached spreadsheet image. Initial explore revealed 6 orphaned PT-duplicate page folders and 4 pages with mocks defined locally instead of in core/mocks.
**Skill:** None (general workflow)
**Type:** internal
**Phase/Area:** Task scoping

**Issue:** A vague instruction ("apply improvements, update mocks") combined with a repo that had real structural ambiguity (duplicate PT/EN folders, some routed some not; local vs core mocks) could easily have led to either under-scoped work (just adding one field) or over-scoped/unwanted work (deleting folders the user actually wanted kept).
**Suggested improvement:** After a first Explore-agent pass maps the repo, use AskUserQuestion with multiSelect to let the user pick which of several concrete improvement buckets to do, plus a single-select question for any destructive/irreversible action (deleting orphaned duplicate folders). This turned an ambiguous request into a bounded, checkable task list.
**Principle:** For open-ended "improve X" requests on an unfamiliar repo, do exploration first, then convert findings into a small set of concrete yes/no scope choices via AskUserQuestion before writing code — especially when any option involves deletion or renaming that touches routing.

### Observation 2: "Search doesn't work" bug was a rigid date-format mismatch, reproduced only by testing real input variants

**Date:** 2026-07-05
**Session context:** User reported the search field on 7 list screens (Angular ERP) as broken. Scoped to just the Produção screen. Code review of the `computed()` filter looked logically correct (`ptDate(p.date).toLowerCase().includes(query)`), and an initial manual test with `21/06` even filtered correctly — the bug was invisible until testing the actual formats a real user types.
**Skill:** systematic-debugging
**Type:** open-source
**Phase/Area:** Phase 1 (Root Cause Investigation) / Phase 3 (Hypothesis and Testing)

**Issue:** Reading the filter code and testing one obviously-correct query (`21/06`) both suggested the feature worked, which would have led to a false "can't reproduce" conclusion. The actual bug only appeared with realistic-but-different input formats: no leading zero (`1/7`), ISO paste (`2026-07-01`), dash/dot separators. A substring-match filter against a single rigidly-formatted string (`dd/mm/yyyy`) silently fails for every other reasonable representation of the same date, and users experience that as "search is completely broken" even though it works for the one exact format the developer tried.
**Suggested improvement:** In systematic-debugging Phase 1 ("Reproduce Consistently"), when the reported symptom is "doesn't work" but a quick manual test succeeds, explicitly test a small matrix of realistic input *variants* (different formats, casing, separators, leading zeros, copy-pasted values from elsewhere in the same UI) before concluding the code path is healthy. A single passing manual test is not sufficient evidence when the input space has an obvious formatting dimension (dates, phone numbers, currency, IDs).
**Principle:** "I tried it and it worked" is a weak reproduction signal whenever the input has more than one valid textual representation (dates, numbers with separators, names with diacritics). Root-cause investigation for "search/filter is broken" bugs should default to testing format variants, not just one plausible query, especially before ruling out a bug.

### Observation 4: Debug real bugs by reproducing in-browser before trusting code review

**Date:** 2026-07-05
**Session context:** Debugging a reported "search doesn't work" bug on the Plantel screen of an Angular ERP. Code review of the `[ngModel]`+`computed()` filter pattern looked completely correct; manual typing simulation (including native per-keystroke events) also showed the filter working for plain ASCII queries.
**Skill:** None (general workflow) / systematic-debugging
**Type:** internal
**Phase/Area:** Root-cause investigation

**Issue:** Initial hands-on testing (fill, simulated per-character typing, backspace, sort+search combos) all passed, suggesting no bug existed. The actual defect only appeared when testing a query with realistic Portuguese content: species name "Avestruz Açoreana" searched as "acoreana" (no diacritic) returned zero results, while "açoreana" (correct accent) matched. `.toLowerCase().includes()` has no accent normalization, so any real-world PT-BR text with diacritics silently fails to match un-accented queries — this reads to an end user as "search is broken" even though ASCII-only test data never reveals it.
**Suggested improvement:** When a bug report is vague ("X doesn't work") and code review + synthetic ASCII test data reproduce no issue, deliberately test with realistic locale-specific data (accents, punctuation, mixed case) before concluding the code is correct. For PT-BR specifically, always add one accented-string test case when validating any text search/filter.
**Principle:** Absence of a bug in a synthetic/ASCII test is not proof of absence — locale-specific data (diacritics, RTL, unusual whitespace) is a distinct equivalence class from plain-ASCII data and must be tested separately, especially for user-facing search/filter features in non-English apps.

### Observation 3: Parallel sessions editing the same shared file causes transient build errors

**Date:** 2026-07-05
**Session context:** Multiple parallel sessions were each refactoring a different screen (Vendas, Despesas, Estoque, Plantel, Produção, Fluxo de Caixa, Produtos) to use a newly-created shared `FilterByPipe` in `core/pipes/filter-by.pipe.ts`. While investigating my own Plantel changes, the dev server's compile log showed a `Cannot find name 'DIACRITICS'` error at a line number that didn't match the current on-disk file content, and unrelated TS errors from `production.html`/`production.ts` (a screen I wasn't touching) appeared in the same log stream.
**Skill:** None (general workflow) / dispatching-parallel-agents
**Type:** internal
**Phase/Area:** Parallel-session coordination

**Issue:** When several sessions independently read-modify-write the same shared file (or each other's screen files) at nearly the same time, the dev server's incremental compiler can report errors that reflect a transient, in-between state rather than any single session's final, coherent edit. This can look alarming (e.g. "the shared pipe is broken") when in fact it's just a snapshot mid-edit by another session, and resolves itself once all sessions finish saving.
**Suggested improvement:** Before treating a build/log error as caused by your own change, check whether the error's cited line number and content actually match a fresh `cat`/`Read` of the file on disk right now. If they don't match, the error is stale/transient from a concurrent writer, not a real regression — reload and re-check the log rather than trying to "fix" a file that already looks correct.
**Principle:** In a multi-agent/parallel-session environment sharing a single working tree, build tool output is not a reliable source of truth at any single instant — always cross-check surprising compiler errors against the actual current file contents before reacting to them.

### Observation 5: Preview tool's 5-dev-server-per-folder cap forces per-session port configs in launch.json

**Date:** 2026-07-06
**Session context:** Fixing the search bug on the Estoque de Ovos screen, in the same repo where 6 other parallel sessions were each fixing search on a different screen. `preview_start` failed twice: first because a stray `ng serve` (PID leftover from an earlier turn of this same session, before a session-limit reset) already held port 4200 outside the tool's tracking, and after killing it, `preview_start` refused with "Maximum 5 dev servers per folder reached; 5 belong to other chats."
**Skill:** None (general workflow)
**Type:** open-source
**Phase/Area:** Multi-session preview/dev-server coordination

**Issue:** In a workflow where several sessions work the same working tree in parallel, each session's default `preview_start` config points at the same fixed port (from a shared `.claude/launch.json`), and the tool enforces a hard per-folder cap on concurrently tracked dev servers (observed cap: 5). Once other sessions' servers fill that cap, a new session cannot start any server via the default config, even with `autoPort: true`, because `autoPort` only helps when the *same* command can bind a different port automatically — `ng serve` via a plain `npm start` script does not read a `PORT` env var and needs an explicit `--port` CLI flag to actually bind elsewhere. Another session had already worked around this by adding a second `launch.json` entry with a hardcoded alternate port (`erp-front-dev-expenses` on 4288); the fix here was to add one more distinct entry (`erp-front-dev-egg-stock` on 4289).
**Suggested improvement:** When `preview_start` fails with a "maximum dev servers" or "port in use" error while multiple sessions are known to be working the same repo concurrently, don't wait or retry the default config — immediately add a new named configuration to `.claude/launch.json` with a unique hardcoded port and an explicit `--port` arg appended to the run command (e.g. `["start", "--", "--port", "<N>"]`), then call `preview_start` with that new config name. Check `launch.json` first for a pattern already established by a sibling session (naming convention, port range) and follow it rather than inventing a new one.
**Principle:** Tooling that caps concurrent resources per shared workspace (dev server slots, ports) needs an explicit per-session identity (a unique config entry + unique port), not reliance on a shared default — and "auto" port-selection features only work if the underlying start command actually honors a dynamic port, which many `npm start` wrappers around `ng serve`/similar CLIs don't do without an explicit flag.
