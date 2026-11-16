-- QUIZARD – team colors for the dark theme (#12).
--
-- The old palette included red, green and yellow, which now carry meaning
-- (wrong, right, highlight). Teams get colors that stay distinct from those.
-- Existing teams keep their colors; only new joins use the new palette.

create or replace function public.join_session(p_code text, p_team_name text)
returns public.teams
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions;
  v_team    public.teams;
  v_name    text := btrim(coalesce(p_team_name, ''));
  -- No red, green or yellow: those mean wrong, right and highlight (#12).
  v_colors  constant text[] := array[
    '#0090FF', '#D6409F', '#F76B15', '#A78BFA', '#00C2D7', '#E0E4E8', '#E879F9', '#C8A27C'
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
