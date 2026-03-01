interface SafetyCheckResult {
  blocked: boolean;
  response?: string;
}

const SEV0_KEYWORDS = [
  "死にたい",
  "自殺",
  "自傷",
  "消えたい",
  "もう無理",
  "生きていたくない",
];

const SEV1_KEYWORDS = [
  "痛い",
  "怪我",
  "しびれ",
  "骨折",
  "肉離れ",
  "腰が",
  "膝が",
  "関節",
  "病院",
];

const SEV0_RESPONSE = `あなたの気持ちを聞かせてくれてありがとうございます。
一人で抱え込まないでください。

いのちの電話: 0120-783-556（24時間無料）
よりそいホットライン: 0120-279-338（24時間無料）

専門の相談員があなたの話を聞いてくれます。`;

const SEV1_RESPONSE = `体の痛みや不調は、無理せず専門家に相談してください。
整形外科やスポーツ整形を受診することをおすすめします。

痛みがある状態でのトレーニングは症状を悪化させる可能性があります。
まずは回復を最優先にしましょう。`;

export function checkSafety(message: string): SafetyCheckResult {
  const normalized = message.toLowerCase();

  for (const keyword of SEV0_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { blocked: true, response: SEV0_RESPONSE };
    }
  }

  for (const keyword of SEV1_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { blocked: true, response: SEV1_RESPONSE };
    }
  }

  return { blocked: false };
}
