import { runClaude } from "./claude";

export type KnowledgeType = "skill" | "obsidian" | "both";
export type SourceType = "tweet" | "article" | "video" | "paper" | "other";

export interface KnowledgeAnalysis {
  relevant: boolean;
  type: KnowledgeType;
  title: string;
  oneSentenceSummary: string;
  keyInsight: string;
  sourceType: SourceType;
  reason: string;
  category: string;
  tags: string[];
  skillDraft?: string;
}

const ANALYSIS_PROMPT = `あなたはパーソナルナレッジ管理アシスタントです。
以下のWebコンテンツの要約を分析し、ナレッジとして蓄積する価値があるか判定してください。

## ユーザーのプロフィール
- ソフトウェアエンジニア（本業）
- 個人開発・起業でビジネスを立ち上げたいと考えている
- 人生の目標: 金銭的にも時間的にもゆとりをもち、おだやかに幸せに暮らすこと

## 重要: 関連性フィルタ (relevant)

まず最初に、このコンテンツがナレッジとして蓄積する価値があるか判定してください。
上記の目標達成に役立つ知識は幅広く収集します。

### relevant: true（蓄積する価値あり）
- ソフトウェアエンジニアリング（設計、実装、テスト、運用）
- AIエージェント、LLM、プロンプトエンジニアリング
- 開発ツール、サービス、ライブラリの知見
- 業務プロセス改善、生産性向上のテクニック
- キャリア、チーム開発、組織論
- 技術トレンド、アーキテクチャ、ベストプラクティス
- 起業・スタートアップ（事業立ち上げ、PMF、資金調達、法務）
- 個人開発（マネタイズ、プロダクト戦略、マーケティング）
- ビジネスモデル・収益化の知見
- マーケティング・グロース（SEO、SNS運用、コンテンツマーケティング）
- 資産形成・投資・節税（FIRE、副業収入、資産運用）
- 時間管理・ライフハック・生産性向上
- メンタルヘルス・ウェルビーイング・持続可能な働き方

### relevant: false（蓄積する価値なし）→ 他のフィールドは空でOK
- 広告、宣伝、ステマ
- 内容が不明・取得不能なもの
- ゴシップ・芸能ニュース

迷ったら relevant: true にしてください。ただし明らかに無関係なものは false にしてください。

## 判定基準（relevant: true の場合のみ）

### Skill化が適切なケース (type: "skill")
- 繰り返し使えるワークフローやプロセスが記述されている
- プロンプトテンプレートやエンジニアリング手法が含まれる
- Claude Codeのカスタムコマンドとして実装可能な内容

### Obsidian保存が適切なケース (type: "obsidian")
- 知識・概念・アーキテクチャの解説
- ツールやサービスのレビュー・比較
- 事例紹介やケーススタディ
- 一般的なリファレンス情報

### 両方が適切なケース (type: "both")
- 知識としても価値があり、かつ実践的なワークフローも含む

## カテゴリ一覧 (Obsidianフォルダ名)
- AI-Engineering: AIエージェント、LLM活用、プロンプトエンジニアリング
- Prompt-Techniques: プロンプト設計の具体的テクニック
- Tools: 開発ツール、サービス、ライブラリ
- Architecture: ソフトウェア設計、システムアーキテクチャ
- Workflow: 開発プロセス、自動化、CI/CD
- Career: キャリア、チーム、組織
- Startup: 起業、スタートアップ、事業立ち上げ、PMF
- Indie-Dev: 個人開発、サイドプロジェクト、マネタイズ
- Business: ビジネスモデル、収益化、SaaS戦略
- Marketing: マーケティング、SEO、SNS運用、グロース
- Finance: 資産形成、投資、節税、FIRE
- Productivity: 時間管理、ライフハック、生産性向上
- Wellbeing: メンタルヘルス、ウェルビーイング、持続可能な働き方
- General: 上記に当てはまらないもの

## ソースタイプ判定
- "tweet": X(Twitter)の投稿
- "article": ブログ記事、ニュース記事
- "video": YouTube等の動画コンテンツ
- "paper": 論文、技術レポート
- "other": その他

## タイトル生成ルール
- コンテンツの核心を端的に表す日本語タイトル（15〜40文字程度）
- URLや投稿者名は含めない
- 「〜について」「〜のまとめ」のような冗長な表現を避ける
- 例: "MCPサーバーを活用したObsidian自動化", "LLMのコンテキスト長とRAG精度の関係"

## タグ生成ルール
- 3〜5個の具体的なタグ（抽象的すぎないこと）
- 英語のケバブケース（例: "prompt-engineering", "claude-code", "rag"）
- Obsidian Vaultで横断検索に使えるレベルの粒度

## 出力形式
以下のJSON形式のみを出力してください。他のテキストは一切含めないでください。

relevant: false の場合:
{
  "relevant": false,
  "type": "obsidian",
  "title": "",
  "oneSentenceSummary": "",
  "keyInsight": "",
  "sourceType": "tweet" | "article" | "video" | "paper" | "other",
  "reason": "スキップ理由（1行、日本語）",
  "category": "General",
  "tags": []
}

relevant: true の場合:
{
  "relevant": true,
  "type": "skill" | "obsidian" | "both",
  "title": "コンテンツの核心を表すタイトル",
  "oneSentenceSummary": "1文での要約（何が述べられているか）",
  "keyInsight": "このナレッジが重要な理由、実務でどう活かせるか（1〜2文）",
  "sourceType": "tweet" | "article" | "video" | "paper" | "other",
  "reason": "提案理由（1行、日本語）",
  "category": "カテゴリ名",
  "tags": ["tag-1", "tag-2", "tag-3"],
  "skillDraft": "Skill候補の場合のみ: このスキルが何をするか1行で説明"
}

## 要約内容
`;

export interface EmbedMetadata {
  author?: string;
  description?: string;
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  footer?: string;
  timestamp?: string;
  providerName?: string;
  fields?: Array<{ name: string; value: string }>;
}

export function toEmbedMetadata(embed: {
  author?: { name?: string } | null;
  description?: string | null;
  title?: string | null;
  image?: { url?: string } | null;
  thumbnail?: { url?: string } | null;
  video?: { url?: string } | null;
  footer?: { text?: string } | null;
  timestamp?: string | null;
  provider?: { name?: string } | null;
  fields?: Array<{ name: string; value: string }> | null;
}): EmbedMetadata {
  return {
    author: embed.author?.name ?? undefined,
    description: embed.description ?? undefined,
    title: embed.title ?? undefined,
    imageUrl: embed.image?.url ?? undefined,
    thumbnailUrl: embed.thumbnail?.url ?? undefined,
    videoUrl: embed.video?.url ?? undefined,
    footer: embed.footer?.text ?? undefined,
    timestamp: embed.timestamp ?? undefined,
    providerName: embed.provider?.name ?? undefined,
    fields: embed.fields?.length ? embed.fields.map((f) => ({ name: f.name, value: f.value })) : undefined,
  };
}

export async function analyzeForKnowledge(
  summary: string,
  url: string,
  embedMeta?: EmbedMetadata,
): Promise<KnowledgeAnalysis> {
  const parts: string[] = [`URL: ${url}`, ""];

  if (embedMeta) {
    parts.push("## 原文メタデータ（embed）");
    if (embedMeta.author) parts.push(`投稿者: ${embedMeta.author}`);
    if (embedMeta.title) parts.push(`タイトル: ${embedMeta.title}`);
    if (embedMeta.description) parts.push(`本文: ${embedMeta.description}`);
    if (embedMeta.providerName) parts.push(`プロバイダ: ${embedMeta.providerName}`);
    if (embedMeta.footer) parts.push(`フッター: ${embedMeta.footer}`);
    if (embedMeta.timestamp) parts.push(`投稿日時: ${embedMeta.timestamp}`);
    if (embedMeta.imageUrl) parts.push(`画像: ${embedMeta.imageUrl}`);
    if (embedMeta.videoUrl) parts.push(`動画: ${embedMeta.videoUrl}`);
    if (embedMeta.fields?.length) {
      parts.push("追加情報:");
      for (const f of embedMeta.fields) {
        parts.push(`  - ${f.name}: ${f.value}`);
      }
    }
    parts.push("");
    parts.push("## AI要約");
  }

  parts.push(summary);

  const prompt = `${ANALYSIS_PROMPT}

${parts.join("\n")}`;

  const response = await runClaude(prompt);

  // JSON部分を抽出
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse knowledge analysis response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as KnowledgeAnalysis;

  // バリデーション
  if (typeof parsed.relevant !== "boolean") {
    parsed.relevant = true;
  }
  if (!["skill", "obsidian", "both"].includes(parsed.type)) {
    parsed.type = "obsidian";
  }
  if (!parsed.tags || !Array.isArray(parsed.tags)) {
    parsed.tags = [];
  }
  if (!parsed.category) {
    parsed.category = "General";
  }
  if (!parsed.title) {
    parsed.title = "無題のナレッジ";
  }
  if (!parsed.oneSentenceSummary) {
    parsed.oneSentenceSummary = "";
  }
  if (!parsed.keyInsight) {
    parsed.keyInsight = "";
  }
  const validSourceTypes: SourceType[] = ["tweet", "article", "video", "paper", "other"];
  if (!parsed.sourceType || !validSourceTypes.includes(parsed.sourceType)) {
    parsed.sourceType = "other";
  }

  return parsed;
}

export function buildProposalMessage(analysis: KnowledgeAnalysis): string {
  const lines = [
    `💡 **${analysis.title}**`,
    "",
    `> ${analysis.oneSentenceSummary}`,
    "",
    `📝 カテゴリ: ${analysis.category}`,
    `🏷️ タグ: ${analysis.tags.join(", ")}`,
    `🔑 インサイト: ${analysis.keyInsight}`,
  ];

  if (analysis.skillDraft) {
    lines.push(`⚡ スキル候補: ${analysis.skillDraft}`);
  }

  return lines.join("\n");
}
