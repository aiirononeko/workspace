import "dotenv/config";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "child_process";
import { unlinkSync } from "fs";
import { recordAudio } from "./recorder.js";
import { transcribe } from "./transcriber.js";
import { convertStyle } from "./converter.js";

async function main() {
  // APIキー確認
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY が設定されていません");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY が設定されていません");
    process.exit(1);
  }

  const openai = new OpenAI();
  const anthropic = new Anthropic();

  try {
    // Step 1: 録音
    const audioPath = await recordAudio();

    // Step 2: 文字起こし
    console.log("\n📝 文字起こし中...");
    const transcript = await transcribe(openai, audioPath);
    console.log(`\n【元テキスト】\n${transcript}`);

    // Step 3: 文体変換
    console.log("\n🔄 文体変換中...");
    const converted = await convertStyle(anthropic, transcript);
    console.log(`\n【変換結果】\n${converted}`);

    // Step 4: クリップボードにコピー（WSL: win32yank.exe）
    try {
      const clip = spawn("win32yank.exe", ["-i", "--crlf"], {
        stdio: ["pipe", "ignore", "pipe"],
      });

      const stderrChunks: Buffer[] = [];
      clip.stderr.on("data", (chunk: Buffer) => stderrChunks.push(Buffer.from(chunk)));

      clip.stdin.end(converted, "utf8");

      await new Promise<void>((resolve, reject) => {
        clip.once("error", reject);
        clip.once("close", (code) => {
          if (code === 0) return resolve();
          const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
          reject(new Error(`win32yank failed (exit=${code})${stderr ? `: ${stderr}` : ""}`));
        });
      });
      console.log("\n✅ クリップボードにコピーしました");
    } catch {
      console.log(
        "\n⚠️ クリップボードへのコピーに失敗しました（手動でコピーしてください）"
      );
    }

    // 一時ファイル削除
    try {
      unlinkSync(audioPath);
    } catch {}
  } catch (error) {
    console.error(
      "\nエラーが発生しました:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

main();
