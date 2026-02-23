---
name: playwright-check
description: |
  Playwright CLIを使ってブラウザのスクリーンショットを撮影し、UIの表示を確認する。
  フロントエンドのUI実装後にデザインとの差分を検出し、反復的に修正するために使用する。
  トリガー: "playwright", "UI確認", "表示確認", "スクショ確認", "デザイン確認", "ブラウザ確認"
user-invocable: true
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Playwright CLI UI確認スキル

Playwright CLIを使用してブラウザのスクリーンショットを撮影し、実装したUIがデザイン通りかを確認・修正するスキル。

## 前提条件

- `playwright-cli` がインストール済みであること
- 開発サーバーが起動していること（起動していない場合はユーザーに通知する）
- Chromiumのシステム依存ライブラリがインストール済みであること

### 環境セットアップ（初回のみ）

初回利用時やブラウザ起動に失敗した場合は、以下の手順で環境を整備する。
Claude Codeからは `sudo` が使えないため、**ユーザーにターミナルで実行してもらう必要がある**。

**Step 1: playwright-cli のワークスペース初期化とChromiumダウンロード**
```bash
playwright-cli install
```

**Step 2: Chromiumの依存ライブラリをインストール（sudo必要）**

Ubuntu 24.04 (Noble) の場合:
```bash
sudo apt-get update && sudo apt-get install -y \
  libnspr4 libnss3 libasound2t64 \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2
```

> Note: `libnss3` が `libnssutil3.so` と `libsmime3.so` も提供する。
> Ubuntu 24.04では `libasound2` → `libasound2t64` に変更されている。

**確認方法:** ブラウザが起動できない場合、以下で不足ライブラリを特定できる:
```bash
ldd ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>&1 | grep "not found"
```
出力が空であれば準備完了。

## 基本コマンド

```
# ブラウザを開いてURLにアクセス
playwright-cli open <url>

# スクリーンショットを撮影
playwright-cli -s=check screenshot --filename=<path>

# ビューポートをリサイズ（レスポンシブ確認用）
playwright-cli -s=check resize <width> <height>

# ページ遷移
playwright-cli -s=check goto <url>

# ブラウザを閉じる
playwright-cli -s=check close
```

## 実行手順

### 1. セッションの準備

- `check` という名前のセッションでブラウザを起動する
- 対象URLにアクセスする（デフォルト: `http://localhost:4321`）

```bash
playwright-cli -s=check open <url>
```

### 2. スクリーンショット撮影

スクリーンショットは `/tmp/playwright-screenshots/` に保存する。

```bash
mkdir -p /tmp/playwright-screenshots
playwright-cli -s=check screenshot --filename=/tmp/playwright-screenshots/<descriptive-name>.png
```

ファイル名の例:
- `home-desktop.png` — ホーム画面（デスクトップ）
- `home-mobile.png` — ホーム画面（モバイル）
- `article-detail.png` — 記事詳細画面

### 3. スクリーンショットの確認

Readツールを使って撮影したスクリーンショットを確認し、以下の観点でチェックする:

- レイアウトが意図通りか
- テキストの表示・折り返しが正しいか
- 画像やアイコンが正しく表示されているか
- 余白・間隔が適切か
- レスポンシブデザインが正しく動作しているか（モバイル/デスクトップ）

### 4. レスポンシブ確認

主要なブレークポイントでスクリーンショットを撮る:

```bash
# デスクトップ (1280px)
playwright-cli -s=check resize 1280 800
playwright-cli -s=check screenshot --filename=/tmp/playwright-screenshots/<page>-desktop.png

# モバイル (375px)
playwright-cli -s=check resize 375 667
playwright-cli -s=check screenshot --filename=/tmp/playwright-screenshots/<page>-mobile.png
```

### 5. 問題の修正と再確認

問題を発見した場合:

1. 問題点をユーザーに報告する
2. コードを修正する
3. ブラウザをリロードしてスクリーンショットを再撮影する

```bash
playwright-cli -s=check reload
playwright-cli -s=check screenshot --filename=/tmp/playwright-screenshots/<page>-fixed.png
```

4. 修正前後のスクリーンショットを比較して改善を確認する

### 6. セッションの終了

確認が完了したらセッションを閉じる:

```bash
playwright-cli -s=check close
```

## 注意事項

- スクリーンショットの撮影前に、ページの読み込みが完了するまで少し待つ（`sleep 2` など）
- SPAの場合はページ遷移後にも待機時間を入れる
- デザインカンプやモックアップが提供されている場合は、それと並べて比較する
- 修正→確認のサイクルを繰り返し、デザイン通りの実装を目指す
