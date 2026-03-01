import type { ButtonInteraction, Message, ThreadChannel } from "discord.js";
import { saveToObsidian } from "./commands/save";
import { runClaude } from "./claude";
import { config } from "./config";
import { analyzeForKnowledge, toEmbedMetadata, type KnowledgeAnalysis, type EmbedMetadata } from "./knowledge-proposer";
import { URL_REGEX, X_DOMAINS, isXUrl } from "./summarize";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

interface CachedAnalysis {
  analysis: KnowledgeAnalysis;
  summary: string;
  url: string;
  embedMeta?: EmbedMetadata;
}

// 分析結果のキャッシュ (threadId -> analysis)
const analysisCache = new Map<string, CachedAnalysis & { expiresAt: number }>();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1時間

// 期限切れキャッシュの定期クリーンアップ（15分ごと）
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of analysisCache) {
    if (now > value.expiresAt) analysisCache.delete(key);
  }
}, 15 * 60 * 1000);

export function cacheAnalysis(threadId: string, analysis: KnowledgeAnalysis, summary: string, url: string, embedMeta?: EmbedMetadata): void {
  analysisCache.set(threadId, {
    analysis,
    summary,
    url,
    embedMeta,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function getCachedAnalysis(threadId: string): CachedAnalysis | null {
  const cached = analysisCache.get(threadId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    analysisCache.delete(threadId);
    return null;
  }
  return cached;
}

async function recoverFromThread(
  interaction: ButtonInteraction,
): Promise<CachedAnalysis | null> {
  try {
    const channel = interaction.channel;
    if (!channel || !channel.isThread()) return null;

    const thread = channel as ThreadChannel;

    // 親メッセージからURLを取得
    const starterMessage = await thread.fetchStarterMessage();
    if (!starterMessage) return null;

    const urls = starterMessage.content.match(URL_REGEX);
    if (!urls || urls.length === 0) return null;
    const url = urls[0];

    // 親メッセージのEmbedからメタデータを復旧（X/Twitter投稿の場合）
    let embedMeta: EmbedMetadata | undefined;
    if (isXUrl(url) && starterMessage.embeds.length > 0) {
      const embed = starterMessage.embeds.find((e) => {
        if (!e.url) return false;
        try {
          const embedHost = new URL(e.url).hostname.replace(/^www\./, "");
          return X_DOMAINS.some((d) => embedHost === d || embedHost.endsWith(`.${d}`));
        } catch {
          return false;
        }
      });
      if (embed && (embed.description || embed.title)) {
        embedMeta = toEmbedMetadata(embed);
      }
    }

    // スレッド内のメッセージからボットのサマリを取得（最初のボットメッセージ）
    const messages = await thread.messages.fetch({ limit: 5 });
    const botMessages = messages
      .filter((m: Message) => m.author.bot && !m.components.length)
      .sort((a: Message, b: Message) => a.createdTimestamp - b.createdTimestamp);

    const summaryMessage = botMessages.first();
    if (!summaryMessage) return null;
    const summary = summaryMessage.content;

    // 再分析（embedMetaがあれば渡す）
    const analysis = await analyzeForKnowledge(summary, url, embedMeta);

    // キャッシュに保存
    cacheAnalysis(thread.id, analysis, summary, url, embedMeta);

    return { analysis, summary, url, embedMeta };
  } catch (error) {
    console.error("[button-handler] Recovery from thread failed:", error);
    return null;
  }
}

export async function handleObsidianButton(interaction: ButtonInteraction): Promise<void> {
  const threadId = interaction.channelId;
  let cached = getCachedAnalysis(threadId);

  if (!cached) {
    // キャッシュミス: スレッドから復旧を試みる
    await interaction.deferReply();
    const recovered = await recoverFromThread(interaction);
    if (!recovered) {
      await interaction.editReply({
        content: "分析結果を復旧できませんでした。再度URLを投稿してください。",
      });
      return;
    }
    cached = recovered;
  } else {
    await interaction.deferReply();
  }

  const { analysis, summary, url, embedMeta } = cached;

  // 構造化されたナレッジ本文を生成
  const contentLines: string[] = [];

  // X/Twitterの場合、Embed原文を最初に表示
  if (embedMeta && (embedMeta.description || embedMeta.title)) {
    contentLines.push(`## Original Content`);
    contentLines.push("");
    if (embedMeta.author) contentLines.push(`**${embedMeta.author}**`);
    if (embedMeta.title) contentLines.push(`> ${embedMeta.title}`);
    if (embedMeta.description) {
      contentLines.push("");
      contentLines.push(embedMeta.description);
    }
    contentLines.push("");
  }

  if (analysis.keyInsight) {
    contentLines.push(`## Key Insight`);
    contentLines.push("");
    contentLines.push(analysis.keyInsight);
    contentLines.push("");
  }

  contentLines.push(`## Summary`);
  contentLines.push("");
  const summaryText = summary.trim() || analysis.oneSentenceSummary || "";
  contentLines.push(summaryText);
  contentLines.push("");
  contentLines.push(`## Source`);
  contentLines.push("");
  contentLines.push(`- URL: ${url}`);
  contentLines.push(`- Type: ${analysis.sourceType}`);

  const result = saveToObsidian({
    title: analysis.title,
    content: contentLines.join("\n"),
    tags: analysis.tags,
    folder: analysis.category,
    source: "discord-bookmark",
    sourceType: analysis.sourceType,
    summary: analysis.oneSentenceSummary,
    sourceUrl: url,
  });

  if (result.success) {
    await interaction.editReply({
      content: `📚 Obsidianに保存しました: \`${result.relativePath}\``,
    });
  } else {
    await interaction.editReply({
      content: `保存に失敗しました: ${result.error}`,
    });
  }
}

function toSkillSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

async function runCommand(command: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}\n${stderr.trim()}`);
  }
  return stdout.trim();
}

async function git(args: string[], cwd: string): Promise<string> {
  return runCommand(["git", ...args], cwd);
}

export async function handleSkillDraftButton(interaction: ButtonInteraction): Promise<void> {
  const threadId = interaction.channelId;
  let cached = getCachedAnalysis(threadId);

  if (!cached) {
    await interaction.deferReply();
    const recovered = await recoverFromThread(interaction);
    if (!recovered) {
      await interaction.editReply({
        content: "分析結果を復旧できませんでした。再度URLを投稿してください。",
      });
      return;
    }
    cached = recovered;
  } else {
    await interaction.deferReply();
  }

  const { analysis, summary, url } = cached;

  const prompt = `以下のコンテンツ要約をもとに、Claude Codeのカスタムスキル（Markdownファイル）のドラフトを生成してください。

## スキルの概要
${analysis.skillDraft || "要約内容に基づくスキル"}

## 元のコンテンツ
URL: ${url}

${summary}

## 出力形式
Claude Codeのスキル用Markdownを生成してください。以下の構造に従ってください:

# スキル名

## 概要
このスキルの目的と使い方

## 手順
1. ステップ1
2. ステップ2
...

## プロンプト
実際に使用するプロンプトやテンプレート

## 追加の指示
- スキル名は日本語でも英語でもOK（ただしフォルダ名用に英語のslugも考えてください）
- 最初の行に \`slug: english-skill-name\` を含めてください（フォルダ名に使います）
- 実践的で具体的な内容にしてください

Markdownのみを出力してください。`;

  try {
    const draft = await runClaude(prompt);

    // slugを抽出（先頭行の "slug: xxx" から）
    const slugMatch = draft.match(/^slug:\s*(.+)$/m);
    const skillSlug = slugMatch
      ? toSkillSlug(slugMatch[1])
      : toSkillSlug(analysis.tags[0] || "new-skill");

    // slug行を除去した本文
    const skillContent = draft.replace(/^slug:\s*.+\n?/m, "").trimStart();

    const workspaceDir = config.workspaceDir;
    const branchName = `skill/${skillSlug}`;
    const skillDir = join(".claude", "skills", skillSlug);
    const skillFilePath = join(skillDir, "SKILL.md");
    const absSkillDir = join(workspaceDir, skillDir);

    // ブランチ作成 → ファイル追加 → コミット → プッシュ → PR作成
    const originalBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"], workspaceDir);

    try {
      // ブランチ作成・切り替え
      await git(["checkout", "-b", branchName], workspaceDir);

      // スキルファイル作成
      mkdirSync(absSkillDir, { recursive: true });
      writeFileSync(join(workspaceDir, skillFilePath), skillContent, "utf-8");

      // コミット
      await git(["add", skillFilePath], workspaceDir);
      await git(["commit", "-m", `feat: add ${skillSlug} skill draft`], workspaceDir);

      // プッシュ
      await git(["push", "-u", "origin", branchName], workspaceDir);

      // PR作成
      const prBody = [
        "## Summary",
        "",
        `- ブックマークから自動生成されたSkillドラフト`,
        `- 元URL: ${url}`,
        `- カテゴリ: ${analysis.category}`,
        `- タグ: ${analysis.tags.join(", ")}`,
        "",
        "## Skill概要",
        "",
        analysis.skillDraft || "要約内容に基づくスキル",
        "",
        "---",
        "🤖 Discord bookmark-watcher から自動生成",
      ].join("\n");

      const prResult = await runCommand(
        ["gh", "pr", "create", "--title", `feat: add ${skillSlug} skill`, "--body", prBody, "--base", "main"],
        workspaceDir,
      );

      // PR URLを抽出
      const prUrl = prResult.match(/https:\/\/github\.com\/.+\/pull\/\d+/)?.[0] || prResult;

      // スレッドに結果を投稿
      const replyContent = [
        `⚡ **Skillドラフトを作成し、PRを作成しました**`,
        "",
        `📁 \`${skillFilePath}\``,
        `🔀 ブランチ: \`${branchName}\``,
        `🔗 PR: ${prUrl}`,
        "",
        skillContent.length <= 1500
          ? skillContent
          : skillContent.slice(0, 1500) + "...",
      ].join("\n");

      if (replyContent.length <= 2000) {
        await interaction.editReply({ content: replyContent });
      } else {
        await interaction.editReply({
          content: replyContent.slice(0, 1997) + "...",
        });
      }
    } finally {
      // 元のブランチに戻す
      try {
        await git(["checkout", originalBranch], workspaceDir);
      } catch {
        // チェックアウト失敗時は無視（既に元ブランチの可能性）
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    await interaction.editReply({
      content: `Skillドラフトの作成に失敗しました: ${message}`,
    });
  }
}
