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
  question_index: number | null;
  question_count: number | null;
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

export type Question = {
  id: string;
  quiz_id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  config: SingleChoiceConfig | Record<string, unknown>;
  time_limit_s: number | null;
  points: number;
};

/** single_choice: config, answer key and team payload (0-based indexes). */
export type SingleChoiceConfig = { options: string[] };
export type SingleChoiceKey = { correct: number };
export type SingleChoicePayload = { choice: number };

export type Answer = {
  id: string;
  session_id: string;
  question_id: string;
  team_id: string;
  payload: SingleChoicePayload | Record<string, unknown>;
  locked_at: string | null;
  points: number | null;
  graded: boolean;
};

export type ScoreRow = {
  team_id: string;
  name: string;
  color: string;
  score: number;
};
