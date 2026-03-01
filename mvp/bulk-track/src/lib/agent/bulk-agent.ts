import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { getSystemPrompt } from "./personalities";
import { createAgentTools } from "./tools";
import { checkSafety } from "./safety-rules";
import {
  getRecentConversations,
  saveConversation,
  trackEvent,
  getRecentWorkouts,
} from "@/lib/db/queries";
import type { Personality } from "@/types";

interface AgentResponse {
  text: string;
  blocked: boolean;
}

export async function runBulkAgent(
  userId: string,
  userMessage: string,
  personality: Personality
): Promise<AgentResponse> {
  // 1. 安全性チェック（LLM呼び出し前）
  const safetyResult = checkSafety(userMessage);
  if (safetyResult.blocked) {
    await saveConversation(userId, "user", userMessage);
    await saveConversation(userId, "assistant", safetyResult.response!);
    await trackEvent(userId, "safety_triggered", {
      message: userMessage,
      severity: safetyResult.response!.includes("いのちの電話")
        ? "sev0"
        : "sev1",
    });
    return { text: safetyResult.response!, blocked: true };
  }

  // 2. コンテキスト構築
  const [conversations, recentWorkouts] = await Promise.all([
    getRecentConversations(userId, 10),
    getRecentWorkouts(userId, 5),
  ]);

  const workoutSummary =
    recentWorkouts.length > 0
      ? `\n\n## 最近のワークアウト記録\n${recentWorkouts
          .map(
            (w) =>
              `- ${w.exercise}: ${JSON.stringify(w.sets)} (${w.created_at})`
          )
          .join("\n")}`
      : "";

  const systemPrompt = getSystemPrompt(personality) + workoutSummary;

  const messages: Array<{ role: "user" | "assistant"; content: string }> =
    conversations.map((c) => ({
      role: c.role as "user" | "assistant",
      content: c.content,
    }));
  messages.push({ role: "user", content: userMessage });

  // 3. ユーザーメッセージ保存
  await saveConversation(userId, "user", userMessage);
  await trackEvent(userId, "message_sent");

  // 4. LLM呼び出し
  const tools = createAgentTools(userId);

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(5),
  });

  const assistantMessage = result.text;

  // 5. アシスタントメッセージ保存
  await saveConversation(userId, "assistant", assistantMessage);

  return { text: assistantMessage, blocked: false };
}
