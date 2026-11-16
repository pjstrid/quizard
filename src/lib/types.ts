// Row types that mirror supabase/migrations/*_init.sql.
// Can later be replaced with generated types: npx supabase gen types typescript --linked

export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'true_false'
  | 'range'
  | 'closest'
  | 'free_text'
  | 'list_timed';

export type SessionStatus = 'lobby' | 'playing' | 'finished';
export type SessionPhase = 'question' | 'locked' | 'reveal';

export type Quiz = {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
};

export type GameSession = {
  id: string;
  quiz_id: string;
  host_id: string;
  join_code: string;
  status: SessionStatus;
  current_position: number | null;
  phase: SessionPhase | null;
  phase_started_at: string | null;
  created_at: string;
};

export type Team = {
  id: string;
  session_id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};
