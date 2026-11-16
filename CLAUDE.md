@AGENTS.md

## QUIZARD

- Plan and architecture: docs/PLAN.md.
- **Language:** everything in the repo is in English (branches, commits, PR descriptions, issues, docs, code comments). The app UI is Swedish for now; English UI comes later via i18n. The user chats in Swedish.
- **Git workflow:** never commit to `main` directly. Use short-lived branches (`feat/…`, `fix/…`, `chore/…`, `docs/…`) and PRs that follow `.github/pull_request_template.md` and link the issue (`Closes #N`).
- Database changes go in a new file under supabase/migrations/. Never edit an already-applied migration.
- After a schema/RLS change: update and run `npm run test:db` (PGlite, supabase/tests/rls.test.mjs).
- Teams = anonymous Supabase users; quizmaster = email user. Teams must never be able to write points or read question_keys before reveal.
- CI (.github/workflows/ci.yml) runs typecheck, lint and test:db on every PR.
