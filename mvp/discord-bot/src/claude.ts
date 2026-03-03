import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

export async function runClaude(
  prompt: string | Anthropic.Messages.ContentBlockParam[],
  options?: { system?: string },
): Promise<string> {
  const content: Anthropic.Messages.ContentBlockParam[] =
    typeof prompt === "string" ? [{ type: "text", text: prompt }] : prompt;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
      console.log(`[claude] retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.claudeTimeoutMs);

    try {
      const response = await client.messages.create(
        {
          model: config.anthropic.model,
          max_tokens: config.anthropic.maxTokens,
          ...(options?.system ? { system: options.system } : {}),
          messages: [{ role: "user", content }],
        },
        { signal: controller.signal },
      );

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      if (!text) {
        throw new Error(
          `Empty response from Claude (stop_reason: ${response.stop_reason})`,
        );
      }

      console.log(`[claude] stop_reason: ${response.stop_reason}, length: ${text.length}`);
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (controller.signal.aborted) {
        throw new Error(`Claude API timed out after ${config.claudeTimeoutMs}ms`);
      }

      // Retry on 429 (rate limit) or 5xx (server error)
      if (err instanceof Anthropic.APIError && (err.status === 429 || err.status >= 500)) {
        console.warn(`[claude] ${err.status} error: ${err.message}`);
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Claude API failed after retries");
}
