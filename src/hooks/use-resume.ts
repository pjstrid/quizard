import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { GameSession } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export type ResumeTarget =
  | { kind: 'team'; sessionId: string; teamName: string; joinCode: string }
  | { kind: 'host'; sessionId: string; joinCode: string; status: GameSession['status'] }
  | { kind: 'display'; sessionId: string; joinCode: string };

type SessionInfo = Pick<GameSession, 'id' | 'status' | 'join_code'>;

/**
 * A game this device is still part of (as team, host or big screen), so a
 * reload or a closed tab never strands anyone (#6). Returns null when there is none.
 */
export function useResumeTarget() {
  const { session } = useAuth();
  const [target, setTarget] = useState<ResumeTarget | null>(null);
  const userId = session?.user.id;
  const anonymous = session?.user.is_anonymous ?? false;

  useEffect(() => {
    if (!userId) return;
    let active = true;

    (async () => {
      if (!anonymous) {
        const { data } = await supabase
          .from('game_sessions')
          .select('id, status, join_code')
          .eq('host_id', userId)
          .neq('status', 'finished')
          .order('created_at', { ascending: false })
          .limit(1);
        const game = data?.[0] as SessionInfo | undefined;
        if (active) setTarget(game ? { kind: 'host', sessionId: game.id, joinCode: game.join_code, status: game.status } : null);
        return;
      }

      // Anonymous: a team in a running game, or a paired big screen.
      const [{ data: teams }, { data: displays }] = await Promise.all([
        supabase
          .from('teams')
          .select('name, game_sessions(id, status, join_code)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('session_displays')
          .select('game_sessions(id, status, join_code)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (!active) return;

      const team = (teams as unknown as { name: string; game_sessions: SessionInfo | null }[] | null)?.find(
        (t) => t.game_sessions && t.game_sessions.status !== 'finished',
      );
      if (team?.game_sessions) {
        setTarget({ kind: 'team', sessionId: team.game_sessions.id, teamName: team.name, joinCode: team.game_sessions.join_code });
        return;
      }
      const display = (displays as unknown as { game_sessions: SessionInfo | null }[] | null)?.find(
        (d) => d.game_sessions && d.game_sessions.status !== 'finished',
      );
      setTarget(
        display?.game_sessions
          ? { kind: 'display', sessionId: display.game_sessions.id, joinCode: display.game_sessions.join_code }
          : null,
      );
    })();

    return () => {
      active = false;
    };
  }, [userId, anonymous]);

  // Signed out (or switched user): nothing to resume.
  return userId ? target : null;
}
