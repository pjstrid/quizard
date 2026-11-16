-- QUIZARD – stage 1: base schema, row level security and team join.
--
-- Security model in brief:
--   * The quizmaster (QM) is a regular email user. Owns quizzes and hosts sessions.
--   * Teams are *anonymous* Supabase users (auth.jwt() ->> 'is_anonymous' = true).
--     They can never create quizzes, only join a session via join_session().
--   * Correct answers live in question_keys, which teams can only read after reveal.
--   * Teams cannot write answers directly; that is done via RPC functions
--     (submit_answer / reveal_question come in stage 2), so they cannot set their own points.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.question_type as enum (
  'single_choice',  -- multiple choice, one correct, 3–4 options
  'multi_choice',   -- multiple choice, 2–3 correct, 5–8 options
  'true_false',     -- 50/50
  'range',          -- span: smallest span that contains the answer wins
  'closest',        -- closest wins
  'free_text',      -- free text, 1–4 answers (manual grading)
  'list_timed'      -- list as many as you can within the time limit (manual grading)
);

create type public.session_status as enum ('lobby', 'playing', 'finished');
create type public.session_phase  as enum ('question', 'locked', 'reveal');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  created_at  timestamptz not null default now()
);

create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes on delete cascade,
  position      int  not null check (position >= 1),
  type          public.question_type not null,
  prompt        text not null check (char_length(btrim(prompt)) between 1 and 500),
  config        jsonb not null default '{}'::jsonb,  -- options, number of fields, unit, etc.
  time_limit_s  int check (time_limit_s between 5 and 3600),
  points        int not null default 1 check (points between 0 and 100),
  created_at    timestamptz not null default now(),
  -- deferrable so a reorder (swapping positions) works in a single transaction
  unique (quiz_id, position) deferrable initially deferred
);

-- Answer key. Kept separate so RLS can hide it from teams.
create table public.question_keys (
  question_id  uuid primary key references public.questions on delete cascade,
  answer       jsonb not null
);

create table public.game_sessions (
  id                uuid primary key default gen_random_uuid(),
  quiz_id           uuid not null references public.quizzes on delete cascade,
  host_id           uuid not null default auth.uid() references auth.users on delete cascade,
  join_code         text not null unique,
  status            public.session_status not null default 'lobby',
  current_position  int,                    -- null in the lobby
  phase             public.session_phase,   -- null in the lobby
  phase_started_at  timestamptz,            -- shared start time for countdowns
  created_at        timestamptz not null default now()
);

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.game_sessions on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  color       text not null,
  created_at  timestamptz not null default now(),
  unique (session_id, user_id),
  unique (session_id, name)
);

create table public.answers (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.game_sessions on delete cascade,
  question_id  uuid not null references public.questions on delete cascade,
  team_id      uuid not null references public.teams on delete cascade,
  payload      jsonb not null default '{}'::jsonb,
  locked_at    timestamptz,     -- set when the team "locks in"
  points       int,             -- set on reveal (auto) or by the QM (manual)
  graded       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (team_id, question_id)
);

create index on public.questions (quiz_id);
create index on public.game_sessions (quiz_id);
create index on public.game_sessions (host_id);
create index on public.teams (session_id);
create index on public.answers (session_id, question_id);

-- ---------------------------------------------------------------------------
-- Helper functions
--
-- SECURITY DEFINER = runs as the function's owner and bypasses RLS. Used so
-- policies can ask "is the user the host/a team in this session?" without
-- policies on different tables recursing into each other.
-- search_path = '' forces fully qualified names (protects against search_path attacks).
-- ---------------------------------------------------------------------------

create function public.is_anonymous()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create function public.is_quiz_owner(p_quiz_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.quizzes where id = p_quiz_id and owner_id = auth.uid()
  );
$$;

create function public.is_question_owner(p_question_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.questions q
    join public.quizzes z on z.id = q.quiz_id
    where q.id = p_question_id and z.owner_id = auth.uid()
  );
$$;

create function public.is_session_host(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.game_sessions where id = p_session_id and host_id = auth.uid()
  );
$$;

create function public.is_session_team(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teams where session_id = p_session_id and user_id = auth.uid()
  );
$$;

-- 6-character code with no easily confused characters (no 0/O, 1/I/L).
create function public.generate_join_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.game_sessions where join_code = code);
  end loop;
  return code;
end;
$$;

alter table public.game_sessions alter column join_code set default public.generate_join_code();

-- ---------------------------------------------------------------------------
-- Privileges: deny everything first, then allow exactly what is needed.
-- 'anon' = not signed in at all. Anonymous *users* (the teams) have the
-- 'authenticated' role, so RLS decides what they can do.
-- ---------------------------------------------------------------------------

revoke all on public.quizzes, public.questions, public.question_keys,
              public.game_sessions, public.teams, public.answers
  from anon, authenticated;

grant select, insert, delete on public.quizzes to authenticated;
grant update (title) on public.quizzes to authenticated;

grant select, insert, delete on public.questions to authenticated;
grant update (position, type, prompt, config, time_limit_s, points) on public.questions to authenticated;

grant select, insert, update, delete on public.question_keys to authenticated;

grant select, insert, delete on public.game_sessions to authenticated;
grant update (status, current_position, phase, phase_started_at) on public.game_sessions to authenticated;

grant select, delete on public.teams to authenticated;   -- insert only via join_session()
grant select on public.answers to authenticated;         -- writes only via RPC (stage 2)

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.quizzes       enable row level security;
alter table public.questions     enable row level security;
alter table public.question_keys enable row level security;
alter table public.game_sessions enable row level security;
alter table public.teams         enable row level security;
alter table public.answers       enable row level security;

-- quizzes ------------------------------------------------------------------
create policy "owner reads own quizzes, teams read their session's quiz"
  on public.quizzes for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.game_sessions gs
      where gs.quiz_id = quizzes.id and public.is_session_team(gs.id)
    )
  );

create policy "signed-in non-anonymous users create quizzes"
  on public.quizzes for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_anonymous());

create policy "owner updates quiz"
  on public.quizzes for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner deletes quiz"
  on public.quizzes for delete to authenticated
  using (owner_id = auth.uid());

-- questions ----------------------------------------------------------------
create policy "owner manages questions"
  on public.questions for all to authenticated
  using (public.is_quiz_owner(quiz_id)) with check (public.is_quiz_owner(quiz_id));

-- Teams only see questions that have started, never questions ahead.
create policy "teams read started questions"
  on public.questions for select to authenticated
  using (
    exists (
      select 1 from public.game_sessions gs
      where gs.quiz_id = questions.quiz_id
        and gs.status <> 'lobby'
        and questions.position <= gs.current_position
        and public.is_session_team(gs.id)
    )
  );

-- question_keys ------------------------------------------------------------
create policy "owner manages keys"
  on public.question_keys for all to authenticated
  using (public.is_question_owner(question_id)) with check (public.is_question_owner(question_id));

create policy "teams read keys after reveal"
  on public.question_keys for select to authenticated
  using (
    exists (
      select 1 from public.questions q
      join public.game_sessions gs on gs.quiz_id = q.quiz_id
      where q.id = question_keys.question_id
        and public.is_session_team(gs.id)
        and (
          gs.status = 'finished'
          or q.position < gs.current_position
          or (q.position = gs.current_position and gs.phase = 'reveal')
        )
    )
  );

-- game_sessions ------------------------------------------------------------
create policy "host and teams read session"
  on public.game_sessions for select to authenticated
  using (host_id = auth.uid() or public.is_session_team(id));

create policy "quiz owner starts session"
  on public.game_sessions for insert to authenticated
  with check (host_id = auth.uid() and public.is_quiz_owner(quiz_id) and not public.is_anonymous());

create policy "host controls session"
  on public.game_sessions for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "host deletes session"
  on public.game_sessions for delete to authenticated
  using (host_id = auth.uid());

-- teams --------------------------------------------------------------------
create policy "host and teams in the session read teams"
  on public.teams for select to authenticated
  using (public.is_session_host(session_id) or public.is_session_team(session_id));

create policy "host removes a team, a team can leave"
  on public.teams for delete to authenticated
  using (public.is_session_host(session_id) or user_id = auth.uid());

-- answers ------------------------------------------------------------------
create policy "host reads all answers, team reads its own"
  on public.answers for select to authenticated
  using (
    public.is_session_host(session_id)
    or exists (select 1 from public.teams t where t.id = answers.team_id and t.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- RPC: join_session – a team joins with code + team name.
-- Calling it again with the same user only renames the team.
-- ---------------------------------------------------------------------------

create function public.join_session(p_code text, p_team_name text)
returns public.teams
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions;
  v_team    public.teams;
  v_name    text := btrim(coalesce(p_team_name, ''));
  v_colors  constant text[] := array[
    '#E5484D', '#3E63DD', '#30A46C', '#F76B15', '#8E4EC6', '#FFC53D', '#12A594', '#D6409F'
  ];
  v_count   int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_team_name';
  end if;

  select * into v_session from public.game_sessions
  where join_code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.status = 'finished' then
    raise exception 'session_finished';
  end if;
  if v_session.host_id = auth.uid() then
    raise exception 'host_cannot_join';
  end if;

  begin
    select * into v_team from public.teams
    where session_id = v_session.id and user_id = auth.uid();

    if found then
      update public.teams set name = v_name where id = v_team.id returning * into v_team;
    else
      select count(*) into v_count from public.teams where session_id = v_session.id;
      insert into public.teams (session_id, user_id, name, color)
      values (v_session.id, auth.uid(), v_name, v_colors[(v_count % array_length(v_colors, 1)) + 1])
      returning * into v_team;
    end if;
  exception when unique_violation then
    raise exception 'team_name_taken';
  end;

  return v_team;
end;
$$;

-- Functions are executable by PUBLIC by default; restrict them.
revoke execute on function public.join_session(text, text)  from public, anon;
-- generate_join_code() runs as the column default when the host creates a session,
-- so 'authenticated' must keep execute rights.
revoke execute on function public.generate_join_code()      from public, anon;
grant  execute on function public.generate_join_code()      to authenticated;
grant  execute on function public.join_session(text, text)  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: changes to these tables are sent to subscribed clients
-- (RLS still applies – you only get rows you are allowed to read).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.game_sessions, public.teams, public.answers;
