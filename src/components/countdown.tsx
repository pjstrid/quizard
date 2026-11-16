import { useEffect, useRef, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * Seconds left of a question's time limit, counted from the shared
 * `phase_started_at`, so every device counts down from the same moment.
 * Returns null when the question has no time limit.
 *
 * `onExpire` runs once when the time runs out (e.g. to auto-submit a list).
 */
export function useSecondsLeft(startedAt: string | null, limitSeconds: number | null, onExpire?: () => void) {
  const [now, setNow] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!startedAt || !limitSeconds) return;
    const endsAt = new Date(startedAt).getTime() + limitSeconds * 1000;
    let fired = false;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (!fired && current >= endsAt) {
        fired = true;
        onExpireRef.current?.();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [startedAt, limitSeconds]);

  if (!startedAt || !limitSeconds) return null;
  const endsAt = new Date(startedAt).getTime() + limitSeconds * 1000;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function Countdown({ secondsLeft }: { secondsLeft: number | null }) {
  const theme = useTheme();
  if (secondsLeft === null) return null;
  return (
    <ThemedText
      style={{
        fontSize: 40,
        lineHeight: 48,
        fontWeight: 800,
        textAlign: 'center',
        color: secondsLeft <= 5 ? theme.danger : theme.text,
      }}>
      {secondsLeft > 0 ? secondsLeft : 'Tiden är ute!'}
    </ThemedText>
  );
}
