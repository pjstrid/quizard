import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { friendlyError, supabase } from '@/lib/supabase';
import type { GameSession, Team } from '@/lib/types';

/**
 * Live state for a game session: the session row plus its teams.
 * Used by the host lobby as well as the team phones.
 *
 * Realtime: we listen for postgres_changes on `teams` and `game_sessions`.
 * RLS applies to realtime too, so each client only receives rows it is allowed to read.
 */
export function useSessionLive(sessionId: string | undefined) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    const loadSession = async () => {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!active) return;
      if (error) setError(friendlyError(error));
      else setSession(data as GameSession | null);
    };

    const loadTeams = async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at');
      if (active && !error) setTeams(data as Team[]);
    };

    Promise.all([loadSession(), loadTeams()]).finally(() => active && setLoading(false));

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `session_id=eq.${sessionId}` },
        loadTeams,
      )
      // Realtime cannot filter DELETE events, so we listen to all deletes and refetch.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'teams' }, loadTeams)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        (payload) => setSession(payload.new as GameSession),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'game_sessions' }, (payload) => {
        if ((payload.old as Partial<GameSession>).id === sessionId) setSession(null);
      })
      .subscribe((status) => {
        // Fetch again once the subscription is up so nothing that happened in between is missed.
        if (status === 'SUBSCRIBED') {
          loadSession();
          loadTeams();
        }
      });

    // Coming back to the app (phone unlocked, tab refocused): realtime may have
    // missed events while asleep, so fetch the current state again (#6).
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadSession();
        loadTeams();
      }
    });

    return () => {
      active = false;
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { session, teams, loading, error };
}
