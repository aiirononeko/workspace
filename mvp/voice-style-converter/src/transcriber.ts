import OpenAI from "openai";
import { createReadStream } from "fs";

export async function transcribe(
  client: OpenAI,
  audioFilePath: string
): Promise<string> {
  const audioStream = createReadStream(audioFilePath);

  const response = await client.audio.transcriptions.create({
    file: audioStream,
    model: "whisper-1",
    language: "ja",
    prompt:
      "日本語の開発文脈。IT用語（リポジトリ, デプロイ, LP, PoC, API）と敬語語尾（です/ます/でしょうか/お願いします）を正確に。",
    temperature: 0,
  });

  return response.text;
}
