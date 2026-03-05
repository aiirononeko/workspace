/**
 * Discord Webhook送信モジュール。
 * Bot APIではなくWebhook経由でEmbed送信する。
 */

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  timestamp?: string;
  footer?: { text: string };
}

export async function sendEmbed(
  webhookUrl: string,
  embeds: Embed[],
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook error: ${response.status} ${text}`);
  }
}

export async function sendMessage(
  webhookUrl: string,
  content: string,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook error: ${response.status} ${text}`);
  }
}
