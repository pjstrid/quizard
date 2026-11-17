# QUIZARD – architecture and MVP plan

## Lessons from the beta (QuizAppVersionOne, Kotlin + Firestore)

What worked: snapshot listeners gave live updates of the teams' answers on the quizmaster's (QM) view.

What does not scale:
- One Activity + one Firestore collection + one data model per question (`question1`…`question12`, `AnswerQ1`…`AnswerQ12`). Questions and correct answers are hardcoded.
- Exactly two teams and three hardcoded accounts (`team1@quiz.se` etc.).
- Grading and scoring happen on the client (the QM's phone), e.g. the range logic in `QuestionFiveActivity.compareAnswer`.
- The teams advance to the "next question" themselves. The QM does not control the flow.

In QUIZARD all of this becomes **data**: a quiz is rows in the database, every question has a *type* and a *config*, and a shared game state (`game_sessions`) decides which question is shown on every device.

## Tech choices

| Part | Choice | Why |
|---|---|---|
| App | **Expo** (React Native) + Expo Router + TypeScript | One codebase for iOS, Android **and web** |
| Backend | **Supabase** (Postgres, Auth, Realtime, RLS) | Relational data fits quiz → questions → answers better than one collection per question. Realtime replaces Firestore snapshot listeners. |
| Team sign-in | Supabase **anonymous sign-in** | Teams join with a code/QR, no account needed |
| QM sign-in | Email + password | The QM owns their quizzes |
| Big screen (MVP) | Expo **web** route `/tv/[sessionId]`, paired with a secret display code | Open in a browser on a TV/laptop, control and grade from the phone. Chromecast/AirPlay comes after MVP. |

One thing to keep in mind: `postgres_changes` checks RLS per subscriber. For a friends' quiz with a handful of teams this does not matter.

## Question types

| `type` | Name | `config` / key / team payload | Grading |
|---|---|---|---|
| `single_choice` | Multiple choice, one correct | `{options: [3–4]}` / `{correct: 0}` / `{choice: 0}` | auto |
| `multi_choice` | Multiple choice, 2–3 correct | `{options: [5–8], pick: 2\|3}` / `{correct: [0, 3]}` / `{choices: [0, 3]}` | auto: 2 correct = all or nothing, 3 correct = points per correct pick. Teams must pick exactly `pick` options |
| `true_false` | 50/50 | `{options: [2]}` / `{correct: 1}` / `{choice: 1}` | auto |
| `range` | Range | `{unit?}` / `{value: 100}` / `{low, high}` | auto: the narrowest range that contains the answer wins, ties share the points, no hit = 0 |
| `closest` | Closest wins | `{unit?}` / `{value: 2097}` / `{value}` | auto: smallest distance wins, ties share the points |
| `free_text` | Free text, 1–4 answers | `{fields: 1–4}` / `{answers: [...]}` (optional) / `{answers: [...]}` | manual: points per accepted field |
| `list_timed` | List as many as you can (needs `time_limit_s`) | `{}` / `{answers: [...]}` (optional) / `{items: [...]}` | manual: points per accepted item, auto-submitted when time is up |

Correct answers live in a **separate table** (`question_keys`) that only the QM can read before the reveal. Otherwise a team could read the answer key straight from the database.

## Data model

See `supabase/migrations/` for the source of truth.

```
quizzes        id, owner_id, title, created_at
questions      id, quiz_id, position, type, prompt, config jsonb, time_limit_s, points
question_keys  question_id (PK), answer jsonb               -- QM only (teams after reveal)
game_sessions  id, quiz_id, host_id, join_code, status, current_position, phase,
               phase_started_at                              -- status: lobby|playing|finished
                                                             -- phase: question|locked|reveal
teams          id, session_id, user_id (anonymous), name, color
answers        id, session_id, question_id, team_id, payload jsonb, locked_at,
               points, graded (bool)                         -- unique(team_id, question_id)
```

The scoreboard is `sum(points) group by team` (a view), not a separate score document as in the beta.

## Realtime flow

```
QM phone ──update game_sessions (next question / reveal)──► Postgres
                                                             │ Realtime
Team phones ◄── game_sessions (which question, which phase) ─┤
Big screen  ◄── game_sessions + answers (who has locked in) ─┘
Team phone ──submit_answer RPC (lock in)──► Postgres
```

- **Big screen**: the host fetches a secret display code (`get_display_code`); a TV browser signs in anonymously and calls `pair_display`, which adds it to `session_displays`. Paired displays get read-only RLS access to the session (all lock-ins, keys only after reveal) and can never write.
- **Lock in**: the team sets `locked_at`. The big screen immediately shows "Team Blue has locked in" without revealing the answer.
- **Reveal**: the QM calls the `reveal_question(session_id)` RPC, a Postgres function that scores the auto-graded types **on the server** and sets `phase = 'reveal'`.
- **Manual grading**: `close_answers` moves to phase `locked` and suggests a grading from the key (case-insensitive, each key value once). The QM accepts/rejects each entry with `grade_answer` (also after reveal, for corrections), which updates `answers.grading` and `answers.points` and bumps `game_sessions.scores_version` so every client refetches the scoreboard.
- Countdown: `phase_started_at` + `time_limit_s`, so every client counts down from the same moment.

## MVP stages

1. ✅ **Foundation**: Expo project, Supabase project, schema + RLS migration, auth (QM + anonymous teams), lobby where teams appear live.
2. ✅ **Game loop with one question type** (`single_choice`): QM starts the quiz → "next question" → teams lock in → the host view updates live → reveal → points. *This is the core, so it is built first.*
3. ✅ **Remaining auto-graded types**: `multi_choice`, `true_false`, `range`, `closest`.
4. ✅ **Manual types**: `free_text`, `list_timed` + grading view for the QM.
5. ✅ **Quiz editor**: the QM creates and edits quizzes using the templates.
6. ✅ **Big-screen view** (#5): `/tv` pairing + read-only TV view.
7. ✅ **Polish** (#6): QR code to join, animations, resume after reload, app icon and splash.

8. ✅ **English UI** (#7): typed translations in `src/i18n/` (Swedish + English), device language by default with a picker on the start screen.
9. ✅ **Apple TV via AirPlay** (#8): a second iPhone/iPad/Mac shows the big screen and mirrors it. The big screen scales to any window, turns to landscape and keeps the device awake. Chromecast and a native AirPlay second screen need a development build and are left for later.

After MVP: Chromecast, native AirPlay second screen (development build), images in questions (Supabase Storage), sharing quizzes, public quizzes.
