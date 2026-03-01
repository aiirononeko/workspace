import { NextRequest, NextResponse } from "next/server";
import { verifySignature, parseWebhookEvents } from "@/lib/line/parser";
import { replyText } from "@/lib/line/client";
import { getOrCreateUser } from "@/lib/db/queries";
import { runBulkAgent } from "@/lib/agent/bulk-agent";
import type { Personality } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-line-signature");

    if (!signature || !verifySignature(body, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const parsed = JSON.parse(body);
    const messages = parseWebhookEvents(parsed);

    // 各メッセージを並列処理
    await Promise.all(
      messages
        .filter((msg) => msg.type === "text" && msg.text)
        .map(async (msg) => {
          try {
            const user = await getOrCreateUser(msg.userId);

            const response = await runBulkAgent(
              user.id,
              msg.text!,
              user.personality as Personality
            );

            await replyText(msg.replyToken, response.text);
          } catch (error) {
            console.error("Error processing message:", error);
            await replyText(
              msg.replyToken,
              "すみません、エラーが発生しました。もう一度試してください。"
            );
          }
        })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// LINE Webhook検証用
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
