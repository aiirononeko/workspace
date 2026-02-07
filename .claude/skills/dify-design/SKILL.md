---
name: dify-design
description: Dify風のモダンデザインをアプリケーションに適用する
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Dify風デザインシステム適用

ユーザーが構築するアプリケーションに、Dify (https://dify.ai/) のデザインエッセンスを反映してください。

以下のデザイントークンとガイドラインに従い、指定されたファイルやコンポーネントにスタイルを適用します。

## デザイントークン

### カラーパレット

```
/* Primary */
--color-primary:          #0033ff;
--color-primary-dark:     #002cd6;
--color-primary-light:    #e5eaff;

/* Accent */
--color-accent:           #dc6803;

/* Background */
--color-bg-primary:       #ffffff;
--color-bg-secondary:     #f8f9fb;
--color-bg-translucent:   rgba(248, 249, 251, 0.5);

/* Text */
--color-text-primary:     #333333;
--color-text-secondary:   #666666;
--color-text-inverse:     #ffffff;
--color-text-heading:     #000000;
```

### タイポグラフィ

```
/* Font Family */
--font-sans:     'Inter', 'Noto Sans JP', system-ui, sans-serif;
--font-display:  'Inter Display', 'Inter', 'Noto Sans JP', sans-serif;
--font-mono:     'Fira Code', 'IBM Plex Mono', monospace;

/* Font Size (mobile-first) */
--text-xs:    0.75rem;   /* 12px */
--text-sm:    0.875rem;  /* 14px */
--text-base:  1rem;      /* 16px */
--text-lg:    1.125rem;  /* 18px */
--text-xl:    1.25rem;   /* 20px */
--text-2xl:   1.5rem;    /* 24px */
--text-3xl:   1.875rem;  /* 30px */
--text-4xl:   2.25rem;   /* 36px */
--text-5xl:   3rem;      /* 48px */

/* Font Weight */
--font-normal:    400;
--font-medium:    500;
--font-semibold:  600;
--font-bold:      700;

/* Line Height */
--leading-tight:   1.25;
--leading-normal:  1.5;
--leading-relaxed: 1.625;
```

### スペーシング・レイアウト

```
/* Spacing */
--space-1:   0.25rem;  /* 4px */
--space-2:   0.5rem;   /* 8px */
--space-3:   0.75rem;  /* 12px */
--space-4:   1rem;     /* 16px */
--space-6:   1.5rem;   /* 24px */
--space-8:   2rem;     /* 32px */
--space-12:  3rem;     /* 48px */
--space-16:  4rem;     /* 64px */
--space-20:  5rem;     /* 80px */
--space-24:  6rem;     /* 96px */

/* Container */
--container-max: 1440px;
--container-padding: 2rem;
```

### ボーダー・シャドウ・角丸

```
/* Border Radius */
--radius-sm:   0.375rem;  /* 6px */
--radius-md:   0.5rem;    /* 8px */
--radius-lg:   0.75rem;   /* 12px */
--radius-xl:   1rem;      /* 16px */
--radius-full: 9999px;

/* Shadow */
--shadow-sm:   0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md:   0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
--shadow-lg:   0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);

/* Border */
--border-color: #e5e7eb;
--border-width: 1px;
```

### ブレークポイント

```
--bp-sm:  640px;
--bp-md:  810px;
--bp-lg:  1140px;
--bp-xl:  1440px;
--bp-2xl: 1728px;
```

## コンポーネントガイドライン

### ボタン

- **Primary**: 背景 `--color-primary`、白テキスト、ホバーで `--color-primary-dark`
- **Secondary**: 背景 `--color-bg-secondary`、ボーダー `--border-color`、ホバーで背景を少し暗く
- **角丸**: `--radius-full`（pill型）または `--radius-md`
- **パディング**: `--space-3` `--space-6`（縦 横）
- **フォント**: `--font-medium`、`--text-sm`

### カード

- 背景: `--color-bg-primary`
- ボーダー: `1px solid var(--border-color)`
- 角丸: `--radius-lg`
- シャドウ: `--shadow-sm`、ホバーで `--shadow-md`
- パディング: `--space-6`

### ナビゲーション

- 背景: `--color-bg-translucent` + `backdrop-filter: blur(12px)`
- 高さ: 64px
- 固定（sticky top）
- テキスト: `--text-sm`、`--font-medium`

### ヒーローセクション

- 中央揃え
- 見出し: `--text-5xl`、`--font-bold`、`--color-text-heading`
- サブテキスト: `--text-lg`、`--color-text-secondary`
- 上下余白: `--space-24`

### セクション

- 最大幅: `--container-max`
- 左右パディング: `--container-padding`
- セクション間余白: `--space-20` 〜 `--space-24`
- 背景の交互切り替え: `--color-bg-primary` / `--color-bg-secondary`

## 全体的なデザイントーン

- **クリーン＆モダン**: 余白を贅沢に使い、情報密度を抑える
- **冷色ブルー基調**: 信頼感・テック感を演出
- **オレンジアクセント**: CTAやハイライトに限定使用
- **ミニマルなボーダー**: 区切りは余白とわずかな背景色差で表現
- **滑らかなトランジション**: ホバー・フォーカスに `transition: all 0.2s ease`

## 適用ルール

1. ユーザーの既存コードを読み、使用しているフレームワーク（React, Next.js, Vue, Tailwindなど）を特定する
2. フレームワークに合った方法でデザイントークンを適用する
   - **Tailwind CSS**: `tailwind.config` にトークンを拡張
   - **CSS Modules / vanilla CSS**: CSS変数として定義
   - **CSS-in-JS**: テーマオブジェクトとして定義
3. 既存のスタイルを壊さず、段階的に適用する
4. レスポンシブ対応を必ず含める
