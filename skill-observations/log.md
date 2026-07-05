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
