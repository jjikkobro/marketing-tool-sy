/**
 * 콘텐츠 포맷 분류 (결정적 규칙).
 *
 * 해시태그는 "주제"이고, 브랜드가 실제로 기획하는 단위는 "포맷"(챌린지, 레시피, 리액션…)이다.
 * LLM 분류는 같은 입력에도 결과가 흔들리고 근거를 대기 어려워서, 규칙으로 나누고 규칙을 그대로 공개한다.
 * 위에서부터 처음 맞는 규칙을 쓴다.
 */
export const FORMAT_RULES = [
  { format: 'challenge', pattern: /challenge|챌린지|\bday \d+\b/i },
  { format: 'recipe_hack', pattern: /recipe|how to|\bhack|레시피|만드는 법|꿀팁/i },
  { format: 'mukbang_asmr', pattern: /mukbang|asmr|eating show|먹방/i },
  {
    format: 'reaction_review',
    pattern: /reaction|review|taste test|first time|trying|리뷰|반응|첫인상/i,
  },
] as const;

export type FormatId = (typeof FORMAT_RULES)[number]['format'] | 'other';

export const FORMAT_LABEL: Record<FormatId, string> = {
  challenge: '챌린지',
  recipe_hack: '레시피·꿀팁',
  mukbang_asmr: '먹방·ASMR',
  reaction_review: '리액션·리뷰',
  other: '기타',
};

/**
 * 캡션을 먼저 보고, 캡션으로 판단할 수 없을 때만 해시태그를 본다.
 * 해시태그는 주제(#spicynoodlechallenge)를 나타내서, 먼저 보면 레시피 영상도 전부 "챌린지"가 된다
 * (실제로 시나리오 데이터 61건이 모두 챌린지로 분류됐다. 캡션 본문에 섞인 #해시태그 때문이었다).
 */
export function classifyFormat(caption: string, hashtags: readonly string[]): FormatId {
  // 캡션 본문에 섞인 해시태그도 주제이므로 지우고 본다
  const prose = caption.replace(/#[\p{L}\p{N}_]+/gu, ' ');
  const byCaption = FORMAT_RULES.find((rule) => rule.pattern.test(prose));
  if (byCaption) return byCaption.format;
  const tags = hashtags.map((tag) => `#${tag}`).join(' ');
  return FORMAT_RULES.find((rule) => rule.pattern.test(tags))?.format ?? 'other';
}

export function isFormatId(value: string): value is FormatId {
  return value in FORMAT_LABEL;
}
