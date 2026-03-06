import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import { enforceGuards } from "../guard";
import { runClaude } from "../claude";

const PR_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+\/?$/;

const SKIP_PATTERNS = [
  /^package-lock\.json$/,
  /^bun\.lock$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /\.min\.(js|css)$/,
  /^\.next\//,
  /^dist\//,
  /^build\//,
  /^node_modules\//,
  /\.snap$/,
];

const MAX_DIFF_CHARS = 120_000;

const REVIEW_SYSTEM_PROMPT = `あなたはプログラミングスクールの講師です。初学者の受講生が提出したPull Requestをレビューしてください。

## レビューの目的
受講生の学習促進が最優先です。初学者が萎縮しないよう、温かく建設的なトーンで書いてください。

## 出力フォーマット

### 総評
PRの全体的な評価を1-2文で。まず努力を認めること。

### 良い点
受講生のコードで良かった点を1-2個、具体的に挙げてください。

### 指摘事項（最大3つ）
重要度が高いものだけを最大3つに絞ってください。細かいスタイルの指摘は不要です。
各指摘はシンプルに:
- **該当箇所**: ファイル名（行番号がわかれば）
- **指摘**: 何をどう直すとよいか、初学者にわかる言葉で簡潔に
- **理由**: なぜ直すべきか一言で

### 次のステップ
今回の課題を踏まえて、次に意識すると良いことを1つだけ。

## レビュー観点（優先度順）
1. 動作の正確性（バグ、ロジックの誤り）
2. 可読性（命名、コードの整理）
3. セキュリティ（明らかな問題がある場合のみ）

## 注意事項
- 初学者向けなので専門用語は避け、平易な言葉で説明してください
- 指摘が3つ未満でも無理に増やさないでください
- 「ここは良いですね」「いい感じです」など、ポジティブな声かけを意識してください`;

export const data = new SlashCommandBuilder()
  .setName("review")
  .setDescription("GitHub PRをレビューする")
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("GitHub PRのURL (例: https://github.com/org/repo/pull/1)")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await enforceGuards(interaction))) return;

  const url = interaction.options.getString("url", true).trim();

  if (!PR_URL_PATTERN.test(url)) {
    await interaction.reply({
      content: "有効なGitHub PR URLを指定してください。\n例: `https://github.com/org/repo/pull/1`",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const [prMeta, prDiff] = await Promise.all([
      fetchPrMeta(url),
      fetchPrDiff(url),
    ]);

    const filteredDiff = filterDiff(prDiff);
    const truncatedDiff = truncateDiff(filteredDiff);

    const prompt = buildReviewPrompt(prMeta, truncatedDiff, url);
    const result = await runClaude(prompt, { system: REVIEW_SYSTEM_PROMPT });

    if (result.length <= 2000) {
      await interaction.editReply(result);
    } else {
      const buffer = Buffer.from(result, "utf-8");
      const attachment = new AttachmentBuilder(buffer, { name: "review.md" });
      await interaction.editReply({
        content: `**${prMeta.title}** のレビュー結果です。`,
        files: [attachment],
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました";
    await interaction.editReply(`レビューエラー: ${message}`);
  }
}

interface PrMeta {
  title: string;
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  baseRefName: string;
  headRefName: string;
  files: Array<{ path: string; additions: number; deletions: number }>;
}

async function fetchPrMeta(url: string): Promise<PrMeta> {
  const proc = Bun.spawn(
    ["gh", "pr", "view", url, "--json", "title,body,additions,deletions,changedFiles,baseRefName,headRefName,files"],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`PRの取得に失敗しました: ${stderr.trim() || `exit code ${exitCode}`}`);
  }

  return JSON.parse(stdout);
}

async function fetchPrDiff(url: string): Promise<string> {
  const proc = Bun.spawn(
    ["gh", "pr", "diff", url],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`PR diffの取得に失敗しました: ${stderr.trim() || `exit code ${exitCode}`}`);
  }

  return stdout;
}

function filterDiff(diff: string): string {
  const fileSections = diff.split(/^diff --git /m);
  const filtered = fileSections.filter((section) => {
    if (!section.trim()) return false;
    const pathMatch = section.match(/^a\/(.+?) b\//);
    if (!pathMatch) return true;
    const filePath = pathMatch[1];
    return !SKIP_PATTERNS.some((p) => p.test(filePath));
  });

  return filtered.map((s) => `diff --git ${s}`).join("");
}

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + "\n\n... (diffが大きいため一部省略されています)";
}

function buildReviewPrompt(meta: PrMeta, diff: string, url: string): string {
  const fileList = meta.files
    .map((f) => `  ${f.path} (+${f.additions} -${f.deletions})`)
    .join("\n");

  return `以下のPull Requestをレビューしてください。

## PR情報
- **URL**: ${url}
- **タイトル**: ${meta.title}
- **ブランチ**: ${meta.headRefName} → ${meta.baseRefName}
- **変更規模**: ${meta.changedFiles}ファイル (+${meta.additions} -${meta.deletions})

## 変更ファイル一覧
${fileList}

## PR説明
${meta.body || "(説明なし)"}

## 差分
\`\`\`diff
${diff}
\`\`\``;
}
