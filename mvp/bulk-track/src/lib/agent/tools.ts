import { tool } from "ai";
import { z } from "zod";
import {
  saveWorkout,
  getRecentWorkouts,
  getWorkoutsByExercise,
  trackEvent,
  updateUserPersonality,
} from "@/lib/db/queries";
import type { Personality } from "@/types";

export function createAgentTools(userId: string) {
  return {
    saveWorkout: tool({
      description:
        "ユーザーのワークアウト記録を保存する。種目名、セット情報（重量・回数・RPE）を構造化して保存。",
      inputSchema: z.object({
        exercise: z.string().describe("種目名（例: ベンチプレス、スクワット）"),
        sets: z
          .array(
            z.object({
              weight: z.number().describe("重量(kg)"),
              reps: z.number().describe("回数"),
              rpe: z.number().optional().describe("RPE (1-10)"),
            })
          )
          .describe("セット情報の配列"),
        note: z.string().optional().describe("メモ"),
      }),
      execute: async ({ exercise, sets, note }) => {
        const workout = await saveWorkout(userId, exercise, sets, note);
        await trackEvent(userId, "workout_logged", {
          exercise,
          setCount: sets.length,
        });
        return {
          success: true,
          workout: {
            id: workout.id,
            exercise: workout.exercise,
            sets: workout.sets,
            created_at: workout.created_at,
          },
        };
      },
    }),

    getWorkoutHistory: tool({
      description:
        "ユーザーの過去のワークアウト記録を取得する。特定の種目でフィルタ可能。",
      inputSchema: z.object({
        exercise: z
          .string()
          .optional()
          .describe("種目名（指定しない場合は全種目）"),
        limit: z.number().optional().default(5).describe("取得件数"),
      }),
      execute: async ({ exercise, limit }) => {
        const workouts = exercise
          ? await getWorkoutsByExercise(userId, exercise, limit)
          : await getRecentWorkouts(userId, limit);
        return { workouts };
      },
    }),

    switchPersonality: tool({
      description:
        "管理者コマンド: パーソナリティを切り替える。A/B/C/D/Eから選択。",
      inputSchema: z.object({
        personality: z
          .enum(["A", "B", "C", "D", "E"])
          .describe("切り替え先のパーソナリティ"),
      }),
      execute: async ({ personality }) => {
        await updateUserPersonality(userId, personality as Personality);
        const names: Record<string, string> = {
          A: "熱血バディ",
          B: "冷静コーチ",
          C: "優しいお姉さん",
          D: "ストイック師匠",
          E: "ゲーミフィケーション好き",
        };
        return {
          success: true,
          message: `パーソナリティを${personality}（${names[personality]}）に切り替えました`,
        };
      },
    }),
  };
}
