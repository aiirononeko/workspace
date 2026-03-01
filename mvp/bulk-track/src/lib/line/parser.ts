import crypto from "crypto";

export interface ParsedMessage {
  type: "text" | "unsupported";
  text?: string;
  userId: string;
  replyToken: string;
}

export function verifySignature(
  body: string,
  signature: string
): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET!;
  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

export function parseWebhookEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
): ParsedMessage[] {
  const events = body.events ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return events.map((event: any) => {
    if (event.type === "message" && event.message.type === "text") {
      return {
        type: "text" as const,
        text: event.message.text,
        userId: event.source.userId,
        replyToken: event.replyToken,
      };
    }
    return {
      type: "unsupported" as const,
      userId: event.source?.userId ?? "unknown",
      replyToken: event.replyToken ?? "",
    };
  });
}
