import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const db = new PGlite();
const QM = '11111111-1111-1111-1111-111111111111';
const T1 = '22222222-2222-2222-2222-222222222222';
const T2 = '33333333-3333-3333-3333-333333333333';
const OTHER = '44444444-4444-4444-4444-444444444444';

// Minimal Supabase stub
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  insert into auth.users values ('${QM}'),('${T1}'),('${T2}'),('${OTHER}');
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
    console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(r.rows));
  } catch (e) {
    const ok = check(null, e);
    ok ? pass++ : fail++;
    console.log(ok ? 'PASS' : 'FAIL', name, ok ? `(${e.message})` : e.message);
  }
}
const rows = (n) => (r, e) => !e && r.rows.length === n;
const err = (re) => (r, e) => !!e && re.test(e.message);

// QM builds a quiz
const quiz = (await as(QM, false, `insert into quizzes (title) values ('Kompisquiz') returning *`)).rows[0];
const q1 = (await as(QM, false, `insert into questions (quiz_id, position, type, prompt, config) values ($1, 1, 'single_choice', 'Huvudstad i Norge?', '{"options":["Oslo","Bergen","Stockholm","Köpenhamn"]}') returning *`, [quiz.id])).rows[0];
const q2 = (await as(QM, false, `insert into questions (quiz_id, position, type, prompt) values ($1, 2, 'closest', 'Hur högt är Kebnekaise?') returning *`, [quiz.id])).rows[0];
await as(QM, false, `insert into question_keys values ($1, '{"index":0}'), ($2, '{"value":2097}')`, [q1.id, q2.id]);
const session = (await as(QM, false, `insert into game_sessions (quiz_id) values ($1) returning *`, [quiz.id])).rows[0];
console.log('join code:', session.join_code);

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
await expect('outsider sees no teams', () => as(OTHER, false, `select * from teams`), rows(0));
await expect('lobby: team sees no questions', () => as(T1, true, `select * from questions`), rows(0));
await expect('team cannot insert team directly', () => as(T1, true, `insert into teams (session_id, user_id, name, color) values ($1, $2, 'Hack', '#000')`, [session.id, T1]), err(/permission denied/));
await expect('team cannot rename via update', () => as(T1, true, `update teams set name = 'x'`), err(/permission denied/));
await expect('team cannot control session', () => as(T1, true, `update game_sessions set status = 'finished' returning *`), rows(0));
await expect('host cannot change join_code', () => as(QM, false, `update game_sessions set join_code = 'AAAAAA'`), err(/permission denied/));
await expect('team cannot write answers directly', () => as(T1, true, `insert into answers (session_id, question_id, team_id) values ($1, $2, gen_random_uuid())`, [session.id, q1.id]), err(/permission denied/));

await as(QM, false, `update game_sessions set status = 'playing', current_position = 1, phase = 'question', phase_started_at = now()`);
await expect('playing q1: team sees only question 1', () => as(T1, true, `select position from questions`), (r) => r?.rows.length === 1 && r.rows[0].position === 1);
await expect('playing q1: team cannot see key', () => as(T1, true, `select * from question_keys`), rows(0));
await expect('host sees all keys', () => as(QM, false, `select * from question_keys`), rows(2));
await as(QM, false, `update game_sessions set phase = 'reveal'`);
await expect('reveal q1: team sees key 1 only', () => as(T1, true, `select * from question_keys`), rows(1));
await as(QM, false, `update game_sessions set current_position = 2, phase = 'question'`);
await expect('q2: team sees 2 questions, 1 key', async () => {
  const qs = await as(T1, true, `select * from questions`);
  const ks = await as(T1, true, `select * from question_keys`);
  return { rows: [qs.rows.length, ks.rows.length] };
}, (r) => r?.rows[0] === 2 && r.rows[1] === 1);
await expect('team can leave', () => as(T2, true, `delete from teams where user_id = $1 returning *`, [T2]), rows(1));
await expect('host deletes session', () => as(QM, false, `delete from game_sessions returning *`), rows(1));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
