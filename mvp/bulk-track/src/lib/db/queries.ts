import { getSupabase } from "./client";
import type {
  Personality,
  User,
  Workout,
  WorkoutSet,
  Conversation,
} from "@/types";

// --- Users ---

export async function getOrCreateUser(lineUserId: string): Promise<User> {
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("line_user_id", lineUserId)
    .single();

  if (existing) return existing as User;

  const personalities: Personality[] = ["A", "B", "C", "D", "E"];
  const randomPersonality =
    personalities[Math.floor(Math.random() * personalities.length)];

  const { data, error } = await supabase
    .from("users")
    .insert({ line_user_id: lineUserId, personality: randomPersonality })
    .select()
    .single();

  if (error) throw new Error(`Failed to create user: ${error.message}`);
  return data as User;
}

export async function updateUserPersonality(
  userId: string,
  personality: Personality
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("users")
    .update({ personality })
    .eq("id", userId);

  if (error)
    throw new Error(`Failed to update personality: ${error.message}`);
}

// --- Workouts ---

export async function saveWorkout(
  userId: string,
  exercise: string,
  sets: WorkoutSet[],
  note?: string
): Promise<Workout> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id: userId, exercise, sets, note })
    .select()
    .single();

  if (error) throw new Error(`Failed to save workout: ${error.message}`);
  return data as Workout;
}

export async function getRecentWorkouts(
  userId: string,
  limit = 10
): Promise<Workout[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get workouts: ${error.message}`);
  return (data ?? []) as Workout[];
}

export async function getWorkoutsByExercise(
  userId: string,
  exercise: string,
  limit = 5
): Promise<Workout[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .ilike("exercise", `%${exercise}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get workouts: ${error.message}`);
  return (data ?? []) as Workout[];
}

// --- Conversations ---

export async function saveConversation(
  userId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, role, content, metadata });

  if (error)
    throw new Error(`Failed to save conversation: ${error.message}`);
}

export async function getRecentConversations(
  userId: string,
  limit = 10
): Promise<Conversation[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error)
    throw new Error(`Failed to get conversations: ${error.message}`);
  return ((data ?? []) as Conversation[]).reverse();
}

// --- Analytics ---

export async function trackEvent(
  userId: string,
  eventName: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("analytics_events")
    .insert({ user_id: userId, event_name: eventName, properties });

  if (error) throw new Error(`Failed to track event: ${error.message}`);
}
