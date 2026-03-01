export type Personality = "A" | "B" | "C" | "D" | "E";

export interface User {
  id: string;
  line_user_id: string;
  personality: Personality;
  created_at: string;
}

export interface WorkoutSet {
  weight: number;
  reps: number;
  rpe?: number;
}

export interface Workout {
  id: string;
  user_id: string;
  exercise: string;
  sets: WorkoutSet[];
  note?: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AnalyticsEvent {
  id: string;
  user_id: string;
  event_name: string;
  properties?: Record<string, unknown>;
  created_at: string;
}
