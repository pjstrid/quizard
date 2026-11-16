import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** Number of big screens paired with a session (host only), kept live via realtime. */
export function useDisplayCount(sessionId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    const load = async () => {
      const { count } = await supabase
        .from('session_displays')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId);
      if (active) setCount(count ?? 0);
    };

    load();
    const channel = supabase
      .channel(`displays:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_displays', filter: `session_id=eq.${sessionId}` },
        load,
      )
      // DELETE events can't be filtered; refetch on any.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'session_displays' }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return count;
}
