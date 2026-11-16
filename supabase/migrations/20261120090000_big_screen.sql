-- QUIZARD – big-screen display (#5).
--
-- A TV or laptop browser pairs with a game session using a secret *display
-- code* that only the host can see (the join code is public to teams, so it
-- can't be used for this). The display signs in anonymously, calls
-- pair_display(code) and becomes a read-only viewer of the session: it can
-- see every team's lock-in status and, after reveal, the results – but it can
-- never control the game or write anything.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.session_displays (
  session_id  uuid not null references public.game_sessions on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- One secret code per session. No table privileges: only reachable via RPCs.
create table public.display_codes (
  session_id  uuid primary key references public.game_sessions on delete cascade,
  code        text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.session_displays enable row level security;
alter table public.display_codes    enable row level security;

revoke all on public.session_displays, public.display_codes from anon, authenticated;
grant select, delete on public.session_displays to authenticated;

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------

create function public.is_session_display(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_displays where session_id = p_session_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Read access for displays (policies are OR'ed with the existing ones)
-- ---------------------------------------------------------------------------

create policy "host and the display itself read displays"
  on public.session_displays for select to authenticated
  using (public.is_session_host(session_id) or user_id = auth.uid());

create policy "host disconnects a display, a display can leave"
  on public.session_displays for delete to authenticated
  using (public.is_session_host(session_id) or user_id = auth.uid());

create policy "displays read their session"
  on public.game_sessions for select to authenticated
  using (public.is_session_display(id));

create policy "displays read the session's quiz"
  on public.quizzes for select to authenticated
  using (
    exists (
      select 1 from public.game_sessions gs
      where gs.quiz_id = quizzes.id and public.is_session_display(gs.id)
    )
  );

create policy "displays read teams"
  on public.teams for select to authenticated
  using (public.is_session_display(session_id));

-- Displays see all answers (to show who has locked in); the view only shows
-- their content after the reveal.
create policy "displays read answers"
  on public.answers for select to authenticated
  using (public.is_session_display(session_id));

create policy "displays read started questions"
  on public.questions for select to authenticated
  using (
    exists (
      select 1 from public.game_sessions gs
      where gs.quiz_id = questions.quiz_id
        and gs.status <> 'lobby'
        and questions.position <= gs.current_position
        and public.is_session_display(gs.id)
    )
  );

create policy "displays read keys after reveal"
  on public.question_keys for select to authenticated
  using (
    exists (
      select 1 from public.questions q
      join public.game_sessions gs on gs.quiz_id = q.quiz_id
      where q.id = question_keys.question_id
        and public.is_session_display(gs.id)
        and (
          gs.status = 'finished'
          or q.position < gs.current_position
          or (q.position = gs.current_position and gs.phase = 'reveal')
        )
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- The host's display code for a session (created on first request).
create function public.get_display_code(p_session_id uuid)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions := public.lock_session_as_host(p_session_id);
  v_code    text;
  alphabet  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_session.status = 'finished' then
    raise exception 'session_finished';
  end if;

  select code into v_code from public.display_codes where session_id = p_session_id;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.display_codes where code = v_code)
          and not exists (select 1 from public.game_sessions where join_code = v_code);
  end loop;

  insert into public.display_codes (session_id, code) values (p_session_id, v_code);
  return v_code;
end;
$$;

-- A display pairs with a session. Returns the session id.
create function public.pair_display(p_code text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select gs.* into v_session
  from public.display_codes dc
  join public.game_sessions gs on gs.id = dc.session_id
  where dc.code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'display_code_not_found';
  end if;
  if v_session.status = 'finished' then
    raise exception 'session_finished';
  end if;

  insert into public.session_displays (session_id, user_id)
  values (v_session.id, auth.uid())
  on conflict do nothing;
  return v_session.id;
end;
$$;

-- get_scoreboard – now also for displays (otherwise unchanged from 20261118090000).
create or replace function public.get_scoreboard(p_session_id uuid)
returns table (team_id uuid, name text, color text, score int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (
    public.is_session_host(p_session_id)
    or public.is_session_team(p_session_id)
    or public.is_session_display(p_session_id)
  ) then
    raise exception 'not_in_session';
  end if;

  return query
    select t.id, t.name, t.color,
           coalesce(sum(a.points) filter (
             where gs.status = 'finished'
                or q.position < gs.current_position
                or (q.position = gs.current_position and gs.phase = 'reveal')
           ), 0)::int
    from public.teams t
    join public.game_sessions gs on gs.id = t.session_id
    left join public.answers a on a.team_id = t.id
    left join public.questions q on q.id = a.question_id
    where t.session_id = p_session_id
    group by t.id
    order by 4 desc, t.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and realtime
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_session_display(uuid),
  public.get_display_code(uuid),
  public.pair_display(text)
from public, anon;

grant execute on function
  public.is_session_display(uuid),
  public.get_display_code(uuid),
  public.pair_display(text)
to authenticated;

-- The host sees "TV connected" live.
alter publication supabase_realtime add table public.session_displays;
