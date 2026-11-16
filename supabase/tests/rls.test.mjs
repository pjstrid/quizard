import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const db = new PGlite();
const QM = '11111111-1111-1111-1111-111111111111';
const T1 = '22222222-2222-2222-2222-222222222222';
const T2 = '33333333-3333-3333-3333-333333333333';
const OTHER = '44444444-4444-4444-4444-444444444444';
const OUT = '55555555-5555-5555-5555-555555555555';
const TV = '66666666-6666-6666-6666-666666666666';

// Minimal Supabase stub
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  insert into auth.users values ('${QM}'),('${T1}'),('${T2}'),('${OTHER}'),('${OUT}'),('${TV}');
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  create publication supabase_realtime;
`);
// Apply every migration in order, like `supabase db push` would.
const dir = process.argv[2] ?? 'supabase/migrations';
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(dir, file), 'utf8'));
  console.log('applied', file);
}

let pass = 0, fail = 0;
async function as(sub, anon, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub, is_anonymous: anon })}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function expect(name, fn, check) {
  try {
    const r = await fn();
    const ok = check(r, null);
    ok ? pass++ : fail++;
    console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(r?.rows ?? r));
  } catch (e) {
    const ok = check(null, e);
    ok ? pass++ : fail++;
    console.log(ok ? 'PASS' : 'FAIL', name, ok ? `(${e.message})` : e.message);
  }
}
const rows = (n) => (r, e) => !e && r.rows.length === n;
const err = (re) => (r, e) => !!e && re.test(e.message);

// ---------------------------------------------------------------------------
// Stage 1: quiz ownership, joining, visibility
// ---------------------------------------------------------------------------

const createQuestion = (prompt, options, correct, timeLimit = null) =>
  as(QM, false, `select * from create_question($1, 'single_choice', $2, $3, $4, $5)`, [
    quiz.id, prompt, JSON.stringify({ options }), JSON.stringify({ correct }), timeLimit,
  ]).then((r) => r.rows[0]);

const quiz = (await as(QM, false, `insert into quizzes (title) values ('Kompisquiz') returning *`)).rows[0];
const q1 = await createQuestion('Huvudstad i Norge?', ['Oslo', 'Bergen', 'Stockholm', 'Köpenhamn'], 0);
const qDeleted = await createQuestion('Tas bort', ['A', 'B', 'C'], 1);
const q3 = await createQuestion('Antal ben på en spindel?', ['6', '8', '10'], 1, 10);
await as(QM, false, `select delete_question($1)`, [qDeleted.id]);
const session = (await as(QM, false, `insert into game_sessions (quiz_id) values ($1) returning *`, [quiz.id])).rows[0];
console.log('join code:', session.join_code);

await expect('positions are renumbered after delete (1, 2)', () => as(QM, false, `select position from questions where quiz_id = $1 order by position`, [quiz.id]),
  (r) => JSON.stringify(r?.rows.map((x) => x.position)) === '[1,2]');
await expect('anonymous user cannot create quiz', () => as(T1, true, `insert into quizzes (title) values ('x')`), err(/row-level security/));
await expect('other user cannot see QM quiz', () => as(OTHER, false, `select * from quizzes`), rows(0));
await expect('other user cannot start session on QM quiz', () => as(OTHER, false, `insert into game_sessions (quiz_id) values ($1)`, [quiz.id]), err(/row-level security/));
await expect('team sees nothing before joining', () => as(T1, true, `select * from game_sessions`), rows(0));
await expect('wrong code', () => as(T1, true, `select * from join_session('ZZZZZZ', 'Blå')`), err(/session_not_found/));
await expect('host cannot join own session', () => as(QM, false, `select * from join_session($1, 'QM')`, [session.join_code]), err(/host_cannot_join/));
await expect('team 1 joins (lowercase code)', () => as(T1, true, `select * from join_session($1, ' Blå ')`, [session.join_code.toLowerCase()]), (r) => r?.rows[0]?.name === 'Blå');
await expect('team 1 rejoin renames', () => as(T1, true, `select * from join_session($1, 'Blåa laget')`, [session.join_code]), (r) => r?.rows[0]?.name === 'Blåa laget');
await expect('team 2 duplicate name rejected', () => as(T2, true, `select * from join_session($1, 'Blåa laget')`, [session.join_code]), err(/team_name_taken/));
await expect('team 2 joins', () => as(T2, true, `select * from join_session($1, 'Röd')`, [session.join_code]), (r) => r?.rows[0]?.color === '#3E63DD');
await expect('team sees session', () => as(T1, true, `select * from game_sessions`), rows(1));
await expect('team sees quiz title', () => as(T1, true, `select * from quizzes`), rows(1));
await expect('team sees both teams', () => as(T1, true, `select * from teams`), rows(2));
await expect('host sees both teams', () => as(QM, false, `select * from teams`), rows(2));
await expect('outsider sees no teams', () => as(OUT, false, `select * from teams`), rows(0));
await expect('lobby: team sees no questions', () => as(T1, true, `select * from questions`), rows(0));
await expect('team cannot insert team directly', () => as(T1, true, `insert into teams (session_id, user_id, name, color) values ($1, $2, 'Hack', '#000')`, [session.id, T1]), err(/permission denied/));
await expect('team cannot rename via update', () => as(T1, true, `update teams set name = 'x'`), err(/permission denied/));
await expect('team cannot update session', () => as(T1, true, `update game_sessions set status = 'finished'`), err(/permission denied/));
await expect('host cannot update session directly (RPCs only)', () => as(QM, false, `update game_sessions set status = 'finished'`), err(/permission denied/));
await expect('team cannot write answers directly', () => as(T1, true, `insert into answers (session_id, question_id, team_id) values ($1, $2, gen_random_uuid())`, [session.id, q1.id]), err(/permission denied/));

// ---------------------------------------------------------------------------
// Stage 2 (#1): question validation
// ---------------------------------------------------------------------------

const cq = (sub, anon, type, options, correct) =>
  as(sub, anon, `select * from create_question($1, $2, 'Fråga', $3, $4)`, [quiz.id, type, JSON.stringify({ options }), JSON.stringify({ correct })]);
await expect('single_choice needs 3–4 options', () => cq(QM, false, 'single_choice', ['A', 'B'], 0), err(/invalid_options/));
await expect('single_choice rejects empty option', () => cq(QM, false, 'single_choice', ['A', ' ', 'C'], 0), err(/invalid_options/));
await expect('single_choice key must be a valid index', () => cq(QM, false, 'single_choice', ['A', 'B', 'C'], 3), err(/invalid_answer_key/));
await expect('single_choice key must be a number', () => cq(QM, false, 'single_choice', ['A', 'B', 'C'], '1'), err(/invalid_answer_key/));
await expect('free_text without fields is rejected', () => cq(QM, false, 'free_text', [], 0), err(/invalid_fields/));
await expect('team cannot create questions', () => cq(T1, true, 'single_choice', ['A', 'B', 'C'], 0), err(/not_quiz_owner/));

// ---------------------------------------------------------------------------
// Stage 2 (#1): game loop
// ---------------------------------------------------------------------------

const rpc = (sub, anon, fn, ...args) =>
  as(sub, anon, `select * from ${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')})`, args);
const submit = (sub, payload) => rpc(sub, true, 'submit_answer', session.id, JSON.stringify(payload));

await expect('team cannot start quiz', () => rpc(T1, true, 'start_quiz', session.id), err(/not_session_host/));
await expect('cannot answer in lobby', () => submit(T1, { choice: 0 }), err(/answers_closed/));
await expect('host starts quiz', () => rpc(QM, false, 'start_quiz', session.id),
  (r) => r?.rows[0]?.status === 'playing' && r.rows[0].current_position === 1 && r.rows[0].question_index === 1 && r.rows[0].question_count === 2);
await expect('cannot start twice', () => rpc(QM, false, 'start_quiz', session.id), err(/invalid_state/));
await expect('q1: team sees only question 1', () => as(T1, true, `select position from questions`), (r) => r?.rows.length === 1 && r.rows[0].position === 1);
await expect('q1: team cannot see key', () => as(T1, true, `select * from question_keys`), rows(0));
await expect('host sees all keys', () => as(QM, false, `select * from question_keys`), rows(2));
await expect('choice out of range rejected', () => submit(T1, { choice: 7 }), err(/invalid_answer/));
await expect('choice as string rejected', () => submit(T1, { choice: '0' }), err(/invalid_answer/));
await expect('team 1 locks in (correct)', () => submit(T1, { choice: 0 }), (r) => r?.rows[0]?.locked_at && r.rows[0].points === null);
await expect('team 1 cannot change locked answer', () => submit(T1, { choice: 1 }), err(/already_locked/));
await expect('team 2 locks in (wrong)', () => submit(T2, { choice: 2 }), rows(1));
await expect('outsider cannot answer', () => submit(OUT, { choice: 0 }), err(/not_in_session/));
await expect('team reads only its own answer', () => as(T1, true, `select * from answers`), rows(1));
await expect('host reads all answers', () => as(QM, false, `select * from answers`), rows(2));
await expect('team cannot set its own points', () => as(T2, true, `update answers set points = 100`), err(/permission denied/));
await expect('cannot skip ahead before reveal', () => rpc(QM, false, 'next_question', session.id), err(/invalid_state/));
await expect('team cannot reveal', () => rpc(T1, true, 'reveal_question', session.id), err(/not_session_host/));
await expect('host reveals q1', () => rpc(QM, false, 'reveal_question', session.id), (r) => r?.rows[0]?.phase === 'reveal');
await expect('reveal scores answers', () => as(QM, false, `select t.name, a.points, a.graded from answers a join teams t on t.id = a.team_id order by t.name`),
  (r) => JSON.stringify(r?.rows) === JSON.stringify([{ name: 'Blåa laget', points: 1, graded: true }, { name: 'Röd', points: 0, graded: true }]));
await expect('team joining late can still join', () => as(OTHER, false, `select * from join_session($1, 'Grön')`, [session.join_code]), rows(1));
await expect('cannot answer after reveal', () => rpc(OTHER, false, 'submit_answer', session.id, JSON.stringify({ choice: 0 })), err(/answers_closed/));
await expect('reveal q1: team sees key 1 only', () => as(T1, true, `select * from question_keys`), rows(1));
await expect('team sees scoreboard', () => rpc(T2, true, 'get_scoreboard', session.id),
  (r) => r?.rows.length === 3 && r.rows[0].name === 'Blåa laget' && r.rows[0].score === 1 && r.rows[1].score === 0);
await expect('outsider cannot see scoreboard', () => rpc(OUT, false, 'get_scoreboard', session.id), err(/not_in_session/));

await expect('next question moves to question 2', () => rpc(QM, false, 'next_question', session.id),
  (r) => r?.rows[0]?.current_position === 2 && r.rows[0].question_index === 2 && r.rows[0].phase === 'question');
await expect('q3: team sees 2 questions, 1 key', async () => {
  const qs = await as(T1, true, `select * from questions`);
  const ks = await as(T1, true, `select * from question_keys`);
  return { rows: [qs.rows.length, ks.rows.length] };
}, (r) => r?.rows[0] === 2 && r.rows[1] === 1);
await db.query(`update game_sessions set phase_started_at = now() - interval '30 seconds' where id = $1`, [session.id]);
await expect('answer after time limit rejected', () => submit(T1, { choice: 1 }), err(/time_up/));
await rpc(QM, false, 'reveal_question', session.id);
await expect('next after last question finishes the quiz', () => rpc(QM, false, 'next_question', session.id),
  (r) => r?.rows[0]?.status === 'finished' && r.rows[0].phase === null);
await expect('finished: team sees all keys', () => as(T1, true, `select * from question_keys`), rows(2));
await expect('team cannot finish quiz', () => rpc(T1, true, 'finish_quiz', session.id), err(/not_session_host/));
await expect('team can leave', () => as(T2, true, `delete from teams where user_id = $1 returning *`, [T2]), rows(1));
await expect('host deletes session', () => as(QM, false, `delete from game_sessions returning *`), rows(1));

// ---------------------------------------------------------------------------
// Stage 3 (#2): auto-graded types – validation
// ---------------------------------------------------------------------------

const quiz2 = (await as(QM, false, `insert into quizzes (title) values ('Alla typer') returning *`)).rows[0];
const create = (type, config, answer) =>
  as(QM, false, `select * from create_question($1, $2, 'Fråga', $3, $4)`, [quiz2.id, type, JSON.stringify(config), JSON.stringify(answer)]);
const opts = (n) => Array.from({ length: n }, (_, i) => `Alt ${i + 1}`);

await expect('true_false needs exactly 2 options', () => create('true_false', { options: opts(3) }, { correct: 0 }), err(/invalid_options/));
await expect('multi_choice needs 5–8 options', () => create('multi_choice', { options: opts(4), pick: 2 }, { correct: [0, 1] }), err(/invalid_options/));
await expect('multi_choice needs 2–3 correct', () => create('multi_choice', { options: opts(5), pick: 1 }, { correct: [0] }), err(/invalid_answer_key/));
await expect('multi_choice rejects 4 correct', () => create('multi_choice', { options: opts(6), pick: 4 }, { correct: [0, 1, 2, 3] }), err(/invalid_answer_key/));
await expect('multi_choice rejects duplicate correct', () => create('multi_choice', { options: opts(5), pick: 2 }, { correct: [1, 1] }), err(/invalid_answer_key/));
await expect('multi_choice pick must match key', () => create('multi_choice', { options: opts(5), pick: 3 }, { correct: [0, 1] }), err(/invalid_pick/));
await expect('range key must be a number', () => create('range', {}, { value: '100' }), err(/invalid_answer_key/));
await expect('closest unit max 20 chars', () => create('closest', { unit: 'x'.repeat(21) }, { value: 1 }), err(/invalid_unit/));

// ---------------------------------------------------------------------------
// Stage 3 (#2): auto-graded types – scoring
// ---------------------------------------------------------------------------

for (const [type, config, answer] of [
  ['true_false', { options: ['Sant', 'Falskt'] }, { correct: 1 }],
  ['multi_choice', { options: opts(6), pick: 2 }, { correct: [0, 3] }],
  ['multi_choice', { options: opts(6), pick: 3 }, { correct: [1, 2, 4] }],
  ['range', { unit: 'st' }, { value: 100 }],
  ['closest', { unit: 'm' }, { value: 2097 }],
  ['range', {}, { value: 50 }],
]) {
  await expect(`create ${type}`, () => create(type, config, answer), rows(1));
}

const s2 = (await as(QM, false, `insert into game_sessions (quiz_id) values ($1) returning *`, [quiz2.id])).rows[0];
await as(T1, true, `select * from join_session($1, 'Ett')`, [s2.join_code]);
await as(T2, true, `select * from join_session($1, 'Två')`, [s2.join_code]);
await as(OTHER, false, `select * from join_session($1, 'Tre')`, [s2.join_code]);
await rpc(QM, false, 'start_quiz', s2.id);

const answer = (sub, payload) => as(sub, sub !== OTHER, `select * from submit_answer($1, $2)`, [s2.id, JSON.stringify(payload)]);
const pointsAfterReveal = async () => {
  await rpc(QM, false, 'reveal_question', s2.id);
  const r = await as(QM, false,
    `select t.name, a.points from answers a join teams t on t.id = a.team_id
     join game_sessions gs on gs.id = a.session_id
     join questions q on q.id = a.question_id and q.position = gs.current_position
     where a.session_id = $1 order by t.name`, [s2.id]);
  return Object.fromEntries(r.rows.map((row) => [row.name, row.points]));
};
const scored = (expected) => (r) => JSON.stringify(r) === JSON.stringify(expected);

// Q1 true_false
await expect('true_false: index 2 rejected', () => answer(T1, { choice: 2 }), err(/invalid_answer/));
await answer(T1, { choice: 1 });
await answer(T2, { choice: 0 });
await expect('true_false scored', pointsAfterReveal, scored({ Ett: 1, 'Två': 0 }));
await rpc(QM, false, 'next_question', s2.id);

// Q2 multi_choice, 2 correct: all or nothing
await expect('multi: too few picks rejected', () => answer(T1, { choices: [0] }), err(/invalid_answer/));
await expect('multi: duplicate picks rejected', () => answer(T1, { choices: [0, 0] }), err(/invalid_answer/));
await expect('multi: out of range rejected', () => answer(T1, { choices: [0, 9] }), err(/invalid_answer/));
await answer(T1, { choices: [0, 3] });
await answer(T2, { choices: [0, 1] });
await answer(OTHER, { choices: [3, 0] });
await expect('multi (2 correct) is all or nothing', pointsAfterReveal, scored({ Ett: 1, Tre: 1, 'Två': 0 }));
await rpc(QM, false, 'next_question', s2.id);

// Q3 multi_choice, 3 correct: point per correct pick
await expect('multi: too many picks rejected', () => answer(T1, { choices: [1, 2, 4, 5] }), err(/invalid_answer/));
await answer(T1, { choices: [1, 2, 4] });
await answer(T2, { choices: [1, 0, 5] });
await answer(OTHER, { choices: [0, 3, 5] });
await expect('multi (3 correct) gives a point per correct pick', pointsAfterReveal, scored({ Ett: 3, Tre: 0, 'Två': 1 }));
await rpc(QM, false, 'next_question', s2.id);

// Q4 range: narrowest containing range wins, ties share, narrow miss gets 0
await expect('range: low > high rejected', () => answer(T1, { low: 110, high: 90 }), err(/invalid_answer/));
await answer(T1, { low: 90, high: 110 });
await answer(T2, { low: 80, high: 100 });
await answer(OTHER, { low: 101, high: 102 });
await expect('range: tie on narrowest hit, miss scores 0', pointsAfterReveal, scored({ Ett: 1, Tre: 0, 'Två': 1 }));
await rpc(QM, false, 'next_question', s2.id);

// Q5 closest: smallest distance wins, ties share, decimals allowed
await expect('closest: string rejected', () => answer(T1, { value: '2100' }), err(/invalid_answer/));
await answer(T1, { value: 2100 });
await answer(T2, { value: 2094 });
await answer(OTHER, { value: 3000.5 });
await expect('closest: tie on distance shares the points', pointsAfterReveal, scored({ Ett: 1, Tre: 0, 'Två': 1 }));
await rpc(QM, false, 'next_question', s2.id);

// Q6 range where nobody hits
await answer(T1, { low: 0, high: 10 });
await expect('range: nobody hits → 0', pointsAfterReveal, scored({ Ett: 0 }));
await expect('scoreboard totals', () => rpc(T2, true, 'get_scoreboard', s2.id),
  (r) => JSON.stringify(r?.rows.map((x) => [x.name, x.score])) === JSON.stringify([['Ett', 7], ['Två', 3], ['Tre', 1]]));

// ---------------------------------------------------------------------------
// Unique team colors
// ---------------------------------------------------------------------------

const s3 = (await as(QM, false, `insert into game_sessions (quiz_id) values ($1) returning *`, [quiz2.id])).rows[0];
const joinS3 = (sub, name) => as(sub, sub !== OTHER, `select * from join_session($1, $2)`, [s3.join_code, name]).then((r) => r.rows[0]);
const a = await joinS3(T1, 'A');
const b = await joinS3(T2, 'B');
await expect('teams get different colors', async () => ({ rows: [a.color, b.color] }), (r) => r.rows[0] !== r.rows[1]);
await as(T1, true, `delete from teams where id = $1`, [a.id]);
await expect('a leaving team frees its color', () => joinS3(OTHER, 'C').then((c) => ({ rows: [c.color] })), (r) => r.rows[0] === a.color);
await expect('rejoining keeps the color', () => joinS3(T2, 'B2').then((c) => ({ rows: [c.color] })), (r) => r.rows[0] === b.color);

// ---------------------------------------------------------------------------
// Stage 4 (#3): manual types – validation
// ---------------------------------------------------------------------------

const quiz3 = (await as(QM, false, `insert into quizzes (title) values ('Manuell') returning *`)).rows[0];
const create3 = (type, config, answer, timeLimit = null) =>
  as(QM, false, `select * from create_question($1, $2, 'Fråga', $3, $4, $5)`, [quiz3.id, type, JSON.stringify(config), JSON.stringify(answer), timeLimit]);

await expect('free_text: max 4 fields', () => create3('free_text', { fields: 5 }, { answers: [] }), err(/invalid_fields/));
await expect('free_text: at least 1 field', () => create3('free_text', { fields: 0 }, { answers: [] }), err(/invalid_fields/));
await expect('free_text: key answers must be strings', () => create3('free_text', { fields: 1 }, { answers: [1] }), err(/invalid_answer_key/));
await expect('list_timed: needs a time limit', () => create3('list_timed', {}, { answers: [] }), err(/time_limit_required/));
await expect('create free_text (2 fields)', () => create3('free_text', { fields: 2 }, { answers: ['Oslo', 'Bergen'] }), rows(1));
await expect('create list_timed', () => create3('list_timed', {}, { answers: ['Skåne', 'Uppland', 'Dalarna'] }, 60), rows(1));
await expect('create single_choice', () => create3('single_choice', { options: ['A', 'B', 'C'] }, { correct: 0 }), rows(1));

// ---------------------------------------------------------------------------
// Stage 4 (#3): manual types – grading flow
// ---------------------------------------------------------------------------

const s4 = (await as(QM, false, `insert into game_sessions (quiz_id) values ($1) returning *`, [quiz3.id])).rows[0];
await as(T1, true, `select * from join_session($1, 'Ett')`, [s4.join_code]);
await as(T2, true, `select * from join_session($1, 'Två')`, [s4.join_code]);
await as(OTHER, false, `select * from join_session($1, 'Tre')`, [s4.join_code]);
await rpc(QM, false, 'start_quiz', s4.id);

const answer4 = (sub, payload) => as(sub, sub !== OTHER, `select * from submit_answer($1, $2)`, [s4.id, JSON.stringify(payload)]);
const answerId = async (teamName) =>
  (await as(QM, false, `select a.id from answers a join teams t on t.id = a.team_id join questions q on q.id = a.question_id
     join game_sessions gs on gs.id = a.session_id where a.session_id = $1 and t.name = $2 and q.position = gs.current_position`, [s4.id, teamName])).rows[0].id;
const grade = (sub, anon, id, grading) => as(sub, anon, `select * from grade_answer($1, $2)`, [id, JSON.stringify(grading)]);
const state4 = async () => {
  const r = await as(QM, false, `select t.name, a.points, a.grading from answers a join teams t on t.id = a.team_id
     join questions q on q.id = a.question_id join game_sessions gs on gs.id = a.session_id
     where a.session_id = $1 and q.position = gs.current_position order by t.name`, [s4.id]);
  return Object.fromEntries(r.rows.map((x) => [x.name, [x.points, x.grading]]));
};
const score4 = async (sub) => {
  const r = await as(sub, sub !== OTHER && sub !== QM, `select * from get_scoreboard($1)`, [s4.id]);
  return Object.fromEntries(r.rows.map((x) => [x.name, x.score]));
};
// Compare objects regardless of key order.
const sorted = (o) => JSON.stringify(Object.keys(o ?? {}).sort().map((k) => [k, o[k]]));
const same = (expected) => (r) => sorted(r) === sorted(expected);

// Q1 free_text, 2 fields, key Oslo/Bergen
await expect('free_text: wrong number of fields rejected', () => answer4(OTHER, { answers: ['Oslo'] }), err(/invalid_answer/));
await answer4(T1, { answers: ['oslo ', 'Stockholm'] });
await answer4(T2, { answers: ['Bergen', 'bergen'] });
await answer4(OTHER, { answers: ['', ''] });
await expect('team cannot close answers', () => rpc(T1, true, 'close_answers', s4.id), err(/not_session_host/));
await expect('host closes answers', () => rpc(QM, false, 'close_answers', s4.id), (r) => r?.rows[0]?.phase === 'locked');
await expect('cannot answer after close', () => answer4(T1, { answers: ['a', 'b'] }), err(/answers_closed/));
await expect('close suggests grading from the key (case-insensitive, each key once)', state4,
  same({ Ett: [1, [true, false]], Tre: [0, [false, false]], 'Två': [1, [true, false]] }));
await expect('suggested points are hidden from the scoreboard before reveal', () => score4(T1), same({ Ett: 0, 'Två': 0, Tre: 0 }));
const ettId = await answerId('Ett');
await expect('team cannot grade', () => grade(T1, true, ettId, [true, true]), err(/not_session_host/));
await expect('grading must match the number of entries', () => grade(QM, false, ettId, [true]), err(/invalid_grading/));
await expect('grading must be booleans', () => grade(QM, false, ettId, [1, 0]), err(/invalid_grading/));
await expect('host accepts a misspelling', () => grade(QM, false, ettId, [true, true]), (r) => r?.rows[0]?.points === 2 && r.rows[0].graded === true);
await rpc(QM, false, 'reveal_question', s4.id);
await expect('reveal keeps the host grading', state4, same({ Ett: [2, [true, true]], Tre: [0, [false, false]], 'Två': [1, [true, false]] }));
await expect('scoreboard after reveal', () => score4(T2), same({ Ett: 2, 'Två': 1, Tre: 0 }));
await expect('host can correct after reveal', async () => grade(QM, false, await answerId('Två'), [true, true]), (r) => r?.rows[0]?.points === 2);
await expect('scoreboard reflects the correction', () => score4(QM), same({ Ett: 2, 'Två': 2, Tre: 0 }));
await expect('grading bumps scores_version so teams refetch', () => as(T1, true, `select scores_version from game_sessions where id = $1`, [s4.id]),
  (r) => r?.rows[0]?.scores_version === 2); // two successful grade_answer calls so far
await rpc(QM, false, 'next_question', s4.id);

// Q2 list_timed, key Skåne/Uppland/Dalarna, revealed without a grading step
await expect('list: max 100 items', () => answer4(T2, { items: Array.from({ length: 101 }, (_, i) => `x${i}`) }), err(/invalid_answer/));
await expect('list: empty items rejected', () => answer4(T2, { items: ['Skåne', ' '] }), err(/invalid_answer/));
await answer4(T1, { items: ['Skåne', 'skåne', 'Gotland', 'Uppland'] });
await answer4(T2, { items: [] });
await rpc(QM, false, 'reveal_question', s4.id);
await expect('reveal from question phase applies the suggestion, duplicates count once', state4,
  same({ Ett: [2, [true, false, false, true]], 'Två': [0, []] }));
await expect('grading is closed for old questions', async () => {
  const oldId = ettId;
  await rpc(QM, false, 'next_question', s4.id);
  return grade(QM, false, oldId, [false, false]);
}, err(/invalid_state/));

// Q3 single_choice: close_answers works for auto types, grade_answer does not
await answer4(T1, { choice: 0 });
await rpc(QM, false, 'close_answers', s4.id);
await expect('grade_answer is only for manual types', async () => grade(QM, false, await answerId('Ett'), [true]), err(/not_manual_question/));
await expect('reveal from locked scores auto types', async () => { await rpc(QM, false, 'reveal_question', s4.id); return state4(); },
  same({ Ett: [1, null] }));

// ---------------------------------------------------------------------------
// Stage 5 (#4): quiz editor
// ---------------------------------------------------------------------------

const quiz5 = (await as(QM, false, `insert into quizzes (title) values ('Editor') returning *`)).rows[0];
const add5 = (prompt) =>
  as(QM, false, `select * from create_question($1, 'single_choice', $2, $3, $4)`, [
    quiz5.id, prompt, JSON.stringify({ options: ['A', 'B', 'C'] }), JSON.stringify({ correct: 0 }),
  ]).then((r) => r.rows[0]);
const e1 = await add5('Ett');
const e2 = await add5('Två');
const e3 = await add5('Tre');
const order5 = () => as(QM, false, `select prompt from questions where quiz_id = $1 order by position`, [quiz5.id]).then((r) => r.rows.map((x) => x.prompt).join(','));
const update5 = (sub, anon, id, type, prompt, config, answer, timeLimit = null, points = 1) =>
  as(sub, anon, `select * from update_question($1, $2, $3, $4, $5, $6, $7)`, [id, type, prompt, JSON.stringify(config), JSON.stringify(answer), timeLimit, points]);

await expect('direct insert into questions is no longer allowed', () => as(QM, false, `insert into questions (quiz_id, position, type, prompt) values ($1, 9, 'closest', 'x')`, [quiz5.id]), err(/permission denied/));
await expect('direct update of questions is no longer allowed', () => as(QM, false, `update questions set prompt = 'x' where id = $1`, [e1.id]), err(/permission denied/));
await expect('direct update of keys is no longer allowed', () => as(QM, false, `update question_keys set answer = '{}' where question_id = $1`, [e1.id]), err(/permission denied/));
await expect('move down', async () => { await as(QM, false, `select move_question($1, 1)`, [e1.id]); return { rows: [await order5()] }; }, (r) => r.rows[0] === 'Två,Ett,Tre');
await expect('move up', async () => { await as(QM, false, `select move_question($1, -1)`, [e3.id]); return { rows: [await order5()] }; }, (r) => r.rows[0] === 'Två,Tre,Ett');
await expect('moving the first question up is a no-op', async () => { await as(QM, false, `select move_question($1, -1)`, [e2.id]); return { rows: [await order5()] }; }, (r) => r.rows[0] === 'Två,Tre,Ett');
await expect('other user cannot move', () => as(OTHER, false, `select move_question($1, 1)`, [e2.id]), err(/not_quiz_owner/));
await expect('update changes type, prompt, key, time and points', () => update5(QM, false, e2.id, 'closest', 'Hur högt?', { unit: 'm' }, { value: 2097 }, 30, 3),
  (r) => r?.rows[0]?.type === 'closest' && r.rows[0].prompt === 'Hur högt?' && r.rows[0].points === 3 && r.rows[0].time_limit_s === 30);
await expect('updated key is stored', () => as(QM, false, `select answer from question_keys where question_id = $1`, [e2.id]), (r) => r?.rows[0]?.answer?.value === 2097);
await expect('update is validated', () => update5(QM, false, e2.id, 'single_choice', 'x', { options: ['A'] }, { correct: 0 }), err(/invalid_options/));
await expect('list needs a time limit on update too', () => update5(QM, false, e2.id, 'list_timed', 'x', {}, { answers: [] }), err(/time_limit_required/));
await expect('other user cannot update', () => update5(OTHER, false, e2.id, 'closest', 'x', {}, { value: 1 }), err(/not_quiz_owner/));
await expect('team cannot update', () => update5(T1, true, e2.id, 'closest', 'x', {}, { value: 1 }), err(/not_quiz_owner/));
await expect('owner can rename quiz', () => as(QM, false, `update quizzes set title = 'Nytt namn' where id = $1 returning title`, [quiz5.id]), (r) => r?.rows[0]?.title === 'Nytt namn');
await expect('other user cannot rename quiz', () => as(OTHER, false, `update quizzes set title = 'x' where id = $1 returning *`, [quiz5.id]), rows(0));

// No edits while a game with the quiz is running
const s5 = (await as(QM, false, `insert into game_sessions (quiz_id) values ($1) returning *`, [quiz5.id])).rows[0];
await expect('editing is allowed while in the lobby', () => update5(QM, false, e3.id, 'single_choice', 'Tre!', { options: ['A', 'B', 'C'] }, { correct: 1 }), rows(1));
await rpc(QM, false, 'start_quiz', s5.id);
await expect('no update during a game', () => update5(QM, false, e3.id, 'single_choice', 'x', { options: ['A', 'B', 'C'] }, { correct: 1 }), err(/quiz_in_play/));
await expect('no move during a game', () => as(QM, false, `select move_question($1, 1)`, [e3.id]), err(/quiz_in_play/));
await expect('no delete during a game', () => as(QM, false, `select delete_question($1)`, [e3.id]), err(/quiz_in_play/));
await expect('no new question during a game', () => add5('Fyra'), err(/quiz_in_play/));
await rpc(QM, false, 'finish_quiz', s5.id);
await expect('delete renumbers after the game', async () => {
  await as(QM, false, `select delete_question($1)`, [e2.id]);
  return as(QM, false, `select prompt, position from questions where quiz_id = $1 order by position`, [quiz5.id]);
}, (r) => JSON.stringify(r?.rows) === JSON.stringify([{ prompt: 'Tre!', position: 1 }, { prompt: 'Ett', position: 2 }]));
await expect('delete removes the key too', () => as(QM, false, `select * from question_keys where question_id = $1`, [e2.id]), rows(0));

// ---------------------------------------------------------------------------
// Stage 6 (#5): big-screen display
// ---------------------------------------------------------------------------

const quiz6 = (await as(QM, false, `insert into quizzes (title) values ('Storskärm') returning *`)).rows[0];
for (const prompt of ['Ett', 'Två']) {
  await as(QM, false, `select * from create_question($1, 'single_choice', $2, $3, $4)`, [
    quiz6.id, prompt, JSON.stringify({ options: ['A', 'B', 'C'] }), JSON.stringify({ correct: 0 }),
  ]);
}
const s6 = (await as(QM, false, `insert into game_sessions (quiz_id) values ($1) returning *`, [quiz6.id])).rows[0];
const otherSession = (await as(QM, false, `insert into game_sessions (quiz_id) values ($1) returning *`, [quiz6.id])).rows[0];
await as(T1, true, `select * from join_session($1, 'Ett')`, [s6.join_code]);
await as(T2, true, `select * from join_session($1, 'Två')`, [s6.join_code]);
const tv = (sql, params) => as(TV, true, sql, params);

await expect('display sees nothing before pairing', () => tv(`select * from game_sessions`), rows(0));
await expect('team cannot get the display code', () => rpc(T1, true, 'get_display_code', s6.id), err(/not_session_host/));
await expect('display codes are not readable directly', () => as(QM, false, `select * from display_codes`), err(/permission denied/));
const displayCode = (await rpc(QM, false, 'get_display_code', s6.id)).rows[0].get_display_code;
await expect('host gets the same code again', () => rpc(QM, false, 'get_display_code', s6.id), (r) => r?.rows[0]?.get_display_code === displayCode);
await expect('display code differs from the join code', async () => ({ rows: [displayCode] }), (r) => r.rows[0] !== s6.join_code && r.rows[0].length === 6);
await expect('the join code does not pair a display', () => tv(`select pair_display($1)`, [s6.join_code]), err(/display_code_not_found/));
await expect('display pairs (lowercase code)', () => tv(`select pair_display($1) as id`, [displayCode.toLowerCase()]), (r) => r?.rows[0]?.id === s6.id);
await expect('pairing twice is fine', () => tv(`select pair_display($1) as id`, [displayCode]), (r) => r?.rows[0]?.id === s6.id);
await expect('display sees only its session', () => tv(`select id from game_sessions`), (r) => r?.rows.length === 1 && r.rows[0].id === s6.id);
await expect('display sees the quiz title', () => tv(`select title from quizzes`), (r) => r?.rows[0]?.title === 'Storskärm');
await expect('display sees all teams', () => tv(`select * from teams`), rows(2));
await expect('lobby: display sees no questions', () => tv(`select * from questions`), rows(0));
await expect('host sees the paired display', () => as(QM, false, `select * from session_displays where session_id = $1`, [s6.id]), rows(1));
await expect('team does not see displays', () => as(T1, true, `select * from session_displays`), rows(0));

await rpc(QM, false, 'start_quiz', s6.id);
await as(T1, true, `select * from submit_answer($1, $2)`, [s6.id, JSON.stringify({ choice: 0 })]);
await as(T2, true, `select * from submit_answer($1, $2)`, [s6.id, JSON.stringify({ choice: 1 })]);
await expect('display sees every team\'s answer (lock-in status)', () => tv(`select * from answers`), rows(2));
await expect('display sees only the current question', () => tv(`select prompt from questions`), (r) => r?.rows.length === 1 && r.rows[0].prompt === 'Ett');
await expect('display cannot see the key before reveal', () => tv(`select * from question_keys`), rows(0));
await expect('display cannot answer', () => tv(`select * from submit_answer($1, $2)`, [s6.id, JSON.stringify({ choice: 0 })]), err(/not_in_session/));
await expect('display cannot control the game', () => rpc(TV, true, 'reveal_question', s6.id), err(/not_session_host/));
await expect('display cannot write answers', () => tv(`update answers set points = 5`), err(/permission denied/));
await expect('display cannot get the display code', () => rpc(TV, true, 'get_display_code', s6.id), err(/not_session_host/));
await rpc(QM, false, 'reveal_question', s6.id);
await expect('display sees the key after reveal', () => tv(`select * from question_keys`), rows(1));
await expect('display sees the scoreboard', () => rpc(TV, true, 'get_scoreboard', s6.id),
  (r) => r?.rows.length === 2 && r.rows[0].name === 'Ett' && r.rows[0].score === 1);
await expect('host disconnects the display', () => as(QM, false, `delete from session_displays where session_id = $1 returning *`, [s6.id]), rows(1));
await expect('disconnected display sees nothing', () => tv(`select * from answers`), rows(0));
await rpc(QM, false, 'finish_quiz', s6.id);
await expect('no pairing to a finished game', () => tv(`select pair_display($1)`, [displayCode]), err(/session_finished/));
await expect('no display code for a finished game', () => rpc(QM, false, 'get_display_code', s6.id), err(/session_finished/));
await expect('other sessions stay hidden', () => tv(`select * from game_sessions where id = $1`, [otherSession.id]), rows(0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
