# Voice Style Converter

Discord向け音声入力文体変換ツール（PoC）

マイクで話した内容を文字起こしし、aiirononekoの文体に自動変換してクリップボードにコピーするCLIツール。

## 前提条件

- Node.js 18+ or Bun
- pulseaudio-utils（音声録音に必要、WSLgで自動利用可能）
- WSL2 + WSLg環境（マイク入力・クリップボード連携）

## セットアップ

### 1. pulseaudio-utilsのインストール

```bash
sudo apt install pulseaudio-utils
```

### 2. パッケージインストール

```bash
bun install
```

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集してAPIキーを設定:

```
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## 使い方

```bash
bun start
```

1. ツールが起動すると録音が開始される
2. マイクに向かって話す
3. Enterキーで録音停止
4. Whisper APIで文字起こし → Claude APIで文体変換
5. 変換結果がクリップボードにコピーされる

## 技術スタック

- TypeScript + tsx
- OpenAI Whisper API（音声→テキスト）
- Anthropic Claude API（文体変換）
- parec / PulseAudio（WSLg経由で音声録音）
- win32yank.exe（WSLクリップボード連携）
