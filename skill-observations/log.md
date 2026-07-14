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

### Observation 6: CDP-driven click on a submit button doesn't fire Angular's (ngSubmit) in this app's login form

**Date:** 2026-07-06
**Session context:** Verifying the dashboard "total geral" egg-count fix by logging into the app via preview tools (Chrome-DevTools-Protocol-based click/fill) and navigating to /platform/dashboard.
**Skill:** webapp-testing
**Type:** open-source
**Phase/Area:** Preview-tool login/navigation workaround

**Issue:** `preview_click` on the login form's `button[type=submit]` (and also on its `.login__submit` class selector) reported "Successfully clicked" both times, but `location.href` stayed on `/login` — the Angular `(ngSubmit)="onSubmit()"` handler never ran, even though the same button, same form, and correctly-filled fields (email/password via `preview_fill`) were used. Filling the password with the wrong value first ("admin123" instead of the actual mock value "123456") was a red herring initially suspected as the cause, but re-testing with the correct password still didn't navigate — only calling `form.requestSubmit()` (or dispatching a `submit` Event) directly via `preview_eval` triggered navigation.
**Suggested improvement:** When a preview-tool click on a `type="submit"` button inside a template-driven/reactive Angular form appears to succeed (tool reports success) but no navigation or state change follows, don't assume the credentials or app logic are wrong — first try triggering the form submit directly via `preview_eval` (`document.querySelector('form...').requestSubmit()`) as a diagnostic. If that navigates successfully, the click dispatch itself (likely an SSR/hydration event-replay quirk) is the actual blocker, not the button's bound handler.
**Principle:** A tool reporting "click succeeded" only confirms the DOM element was hit, not that the framework's event binding actually received and processed it — when using CDP-style clicks against SSR-hydrated Angular forms, treat "no observable effect after a reported-successful click" as its own equivalence class of failure, distinct from wrong-input or app-logic bugs, and rule it out early with a direct DOM-level trigger before debugging the app.

### Observation 7: "Broken zero" bug report traced to positional-instead-of-date-based "latest stock" selection

**Date:** 2026-07-06
**Session context:** User sent a WhatsApp screenshot of the Dashboard's "Disponível em estoque" KPI card ("Aqui ta quebrado esses dois 0") plus a separate unrelated request in the same image ("Travar o cabeçalho") 4 minutes later. Investigated which literal "0" was broken by cropping/upscaling the low-res chat screenshot (385x262px) via PowerShell System.Drawing to confirm exact card text before touching code.
**Skill:** systematic-debugging
**Type:** open-source
**Phase/Area:** Root-cause investigation / reproduction

**Issue:** `dashboard.ts`'s `ultimoEstoque` computed picked `items[items.length - 1]` from the eggStock entity store (IndexedDB `getAll()`, ordered by keyPath, not by date) — while the sibling Egg-Stock page's own `estoqueAtual` computed correctly filtered `date <= today` and reduced to the max-date record, with an explicit comment explaining why ("cada linha é um snapshot... nunca a soma"). Dashboard's cards therefore could show 0 for "Ovos codorna/galinha em estoque" whenever the chronologically-latest IndexedDB record wasn't also the last one by insertion/key order — reproduced by seeding two records directly into IndexedDB via `preview_eval` (one dated later but with an alphabetically-earlier key, one dated earlier with a later key) and confirming the pre-fix code would return the wrong one.
**Suggested improvement:** When a report references a screenshot, crop and upscale the specific region in question (PowerShell `System.Drawing` or equivalent) before speculating about which text/value is "broken" — low-res chat screenshots (WhatsApp downsamples heavily) can make truncated card labels unreadable at native resolution, and guessing wrong wastes an entire investigation pass. Also: when a codebase has two components deriving "current/latest" from the same time-series store, and one already has correct date-based selection logic with an explanatory comment, treat that as the canonical pattern and check whether sibling computed values (elsewhere) replicate the comment's fix or just do a naive `array[length-1]`.
**Principle:** A naive "last item in array" is not the same as "most recent by date" whenever the array's order comes from a persistence layer (IndexedDB, SQL without ORDER BY) that doesn't guarantee insertion order — this class of bug hides silently until real-world data insertion order diverges from date order, and is best verified by directly seeding out-of-order records into the store rather than trusting a code read-through alone.

### Observation 8: Crop/upscale of a low-res screenshot has a hard floor — works for large KPI numerals, fails for dense table cells

**Date:** 2026-07-06
**Session context:** User sent a WhatsApp screenshot ("Soma ( qnt * valor ) = custo mês ta errada") of what turned out to be the Plantel & ração page. Applied the crop/upscale-before-touching-code technique from [[log#Observation 7]] to identify the exact card and verify the reported calculation.
**Skill:** systematic-debugging
**Type:** open-source
**Phase/Area:** Root-cause investigation / reproduction

**Issue:** The source screenshot was natively 388x406px. Cropping the large-font KPI values (e.g. "Investimento mensal") and upscaling 15-20x with HighQualityBicubic produced legible text ("R$ 718,00", "162", "2") that matched `plantel.ts`'s computed values exactly. But the same technique applied to the data table's row cells (six columns packed into ~340px width, so each cell is only a few source pixels tall/wide) stayed an unreadable blur no matter the interpolation mode (NearestNeighbor vs HighQualityBicubic) or scale factor (5x-30x) — upscaling redistributes existing pixels, it cannot invent detail the source never captured. Cross-checking the two legible aggregate numbers (162 total aves, R$718,00 investment) against `plantel.mock.ts` (Codornas 130×3 sacos×R$106 + Galinhas Embrapa 051 32×4 sacos×R$100 = 318+400=718) confirmed the code's `monthlyTotal = feedBagsPerMonth * bagPrice` formula is arithmetically correct and matches the visible evidence — no bug was reproduced from the screenshot alone.
**Suggested improvement:** In [[systematic-debugging]] (or wherever Observation 7's screenshot-crop technique lives), add the caveat: crop/upscale reliably recovers legibility for large single-value text (KPI cards, headers) but has a resolution floor for small multi-column table text — if the disputed value is a KPI, crop that; if it's a dense table cell and the crop still isn't legible after 2-3 scale/interpolation attempts, stop trying to OCR pixels and instead (a) cross-check any legible aggregate numbers against the codebase's own mock/seed data to validate the formula, and/or (b) ask the user for the exact row values or a native-resolution screenshot, rather than escalating crop parameters indefinitely.
**Principle:** Image upscaling is a legibility tool bounded by the source's native information content, not a magnification tool — its ceiling depends on how many source pixels the disputed text occupied, not on how much the tool scales it up. When that ceiling is below what's needed (dense table cells in a small chat screenshot), the productive move is to switch evidence sources (mock data, live app, direct user query) rather than repeating the same technique with larger multipliers.

### Observation 9: A "still broken" bug report can mean the described fix already shipped — check git blame before assuming the code needs changing

**Date:** 2026-07-14
**Session context:** User reported "Prontas para venda hoje" always shows 0 bandejas on the Dashboard, and explicitly described the expected fix as "derive from quailPacks/chickenPacks of the latest stock snapshot, similar to what was fixed before for the Estoque de Ovos carry-forward" (referencing [[log#Observation 7]]'s fix).
**Skill:** systematic-debugging
**Type:** open-source
**Phase/Area:** Phase 1 (Root Cause Investigation) / Phase 2 (Pattern Analysis)

**Issue:** Reading `dashboard.ts` showed the exact fix the user described was *already implemented* (confirmed via `git log -p` / `git show` on the relevant commit, dated 8 days before this session) — `bandejasProntas` already derived from a date-based "most recent snapshot" selection, not a naive `array[length-1]`. Instead of concluding "no bug, close as already-fixed," reproduced the user's exact symptom hands-on: seeded only a "Produção Diária" (daily production) entry via the real UI/IndexedDB, never touching the separate "Estoque de Ovos" (egg stock) screen — and the card correctly showed 0, because the *code* was fine but the *dependency* (a manually-maintained separate snapshot store that real users don't necessarily keep in sync with their actual daily-entry workflow) was empty. This reframed the task from "find the array-index bug" to "the already-fixed calculation is being fed by a store that's realistically often empty."
**Suggested improvement:** In systematic-debugging Phase 1/2, when a user's bug report already names a specific root-cause pattern from a prior fix (e.g. "same bug as before"), verify with `git log -p <file>` / `git blame` whether that exact fix is already present *before* assuming the described code defect still exists. If it's already fixed, don't stop there — reproduce the reported symptom hands-on with realistic user actions (not just re-reading the fixed code) to find what *else* could produce the same visible symptom (e.g., a dependency on a separate, often-unpopulated data source). The "root cause" may have moved from a code bug to a workflow/data-availability gap between two commits.
**Principle:** "The user says it's still broken" and "the code still has the bug" are not the same claim — a fix can be correctly shipped and the symptom can still recur for an entirely different reason (an upstream data gap, a stale deploy, a different code path). Confirming the described fix's presence via version control history, then re-reproducing the symptom from scratch with real user-shaped actions, separates "this needs a new fix" from "this needs a different fix than the one described."

### Observation 10: Splitting a same-file mixed-scope diff into isolated commits without `git add -p` — exact-match Edit calls as safe revert/reapply

**Date:** 2026-07-14
**Session context:** Two unrelated fixes (a Dashboard calculation bug fix, and a new Dashboard KPI feature) both touched `dashboard.ts` and needed separate, isolated commits per the user's request ("commita isolado"). Interactive tools (`git add -p`, `git rebase -i`) are unavailable in this environment.
**Skill:** None (general workflow)
**Type:** open-source
**Phase/Area:** Commit hygiene / working with mixed-scope diffs

**Issue:** After finishing both changes in the same session, `dashboard.ts`/`dashboard.html`/`styles.scss` each had hunks belonging to two different, unrelated pieces of work. Needed two clean, separately-reviewable commits (bug fix; then feature) without an interactive patch tool.
**Suggested improvement:** Use the file-editing tool's exact-string-match requirement as a safe, scriptable substitute for interactive hunk staging: temporarily apply an Edit call that removes exactly the lines belonging to the *second* piece of work (kept verbatim from the just-written code, so re-adding is a straight copy-paste), commit the first piece of work alone, then re-apply the removed lines with a second Edit call and commit the second piece separately. Because the edit tool errors loudly on any text mismatch, this also double-checks that no unrelated concurrent change (e.g. from another session editing the same file) got silently clobbered in the process.
**Principle:** In environments without interactive git tooling, "temporarily revert then reapply via exact-match edits" is a reliable low-tech substitute for `git add -p` when a single file legitimately needs to land in two separate commits — and the exact-match requirement doubles as an integrity check against concurrent edits to the same file, which matters most exactly when other sessions might be touching the same repo (this session also hit that: a parallel session had committed unrelated changes to the very same `import.ts` file mid-session, confirmed non-overlapping only by diffing after the fact — see [[log#Observation 3]]).
