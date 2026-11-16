-- QUIZARD – unique team colors.
--
-- Bug: two teams joining at the same moment both counted 0 existing teams and
-- got the same color. join_session() now locks the session row so joins run
-- one at a time, and picks the first color that no team in the session uses
-- (a team that leaves frees its color).

create or replace function public.join_session(p_code text, p_team_name text)
returns public.teams
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions;
  v_team    public.teams;
  v_name    text := btrim(coalesce(p_team_name, ''));
  v_colors  constant text[] := array[
    '#E5484D', '#3E63DD', '#30A46C', '#F76B15', '#8E4EC6', '#FFC53D', '#12A594', '#D6409F'
  ];
  v_color   text;
  v_count   int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_team_name';
  end if;

  -- `for update`: concurrent joins to the same session wait for each other.
  select * into v_session from public.game_sessions
  where join_code = upper(btrim(coalesce(p_code, '')))
  for update;
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
      select c into v_color
      from unnest(v_colors) with ordinality as palette(c, i)
      where c not in (select color from public.teams where session_id = v_session.id)
      order by i
      limit 1;

      if v_color is null then
        -- More teams than colors: start over from the beginning.
        select count(*) into v_count from public.teams where session_id = v_session.id;
        v_color := v_colors[(v_count % array_length(v_colors, 1)) + 1];
      end if;

      insert into public.teams (session_id, user_id, name, color)
      values (v_session.id, auth.uid(), v_name, v_color)
      returning * into v_team;
    end if;
  exception when unique_violation then
    raise exception 'team_name_taken';
  end;

  return v_team;
end;
$$;
