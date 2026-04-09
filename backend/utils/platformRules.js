export const SOCIAL_PLATFORMS = ["twitter", "linkedin", "reddit"];

export const SOCIAL_PLATFORM_LABELS = {
  twitter: "X Thread",
  linkedin: "LinkedIn Post",
  reddit: "Reddit Post"
};

export const SOCIAL_PLATFORM_SHORT_LABELS = {
  twitter: "X",
  linkedin: "LinkedIn",
  reddit: "Reddit"
};

export const PLATFORM_RULES = {
  twitter: [
    "First post must contain a strong hook rooted in a clear insight, tension, or practical benefit.",
    "Keep lines short and punchy. Avoid long paragraph blocks.",
    "Each post must add a new angle or concrete takeaway.",
    "Use simple direct language and avoid generic filler.",
    "The thread should feel native to X, not like a blog split into parts.",
    "Avoid overly promotional tone."
  ],
  linkedin: [
    "Start with a clear insight, problem statement, or lesson learned.",
    "Keep the tone professional, credible, and conversational.",
    "Use short structured paragraphs of 2 to 4 lines.",
    "Emphasize lessons, outcomes, and useful takeaways over hype.",
    "Avoid slang, clickbait, or aggressive promotion.",
    "Make the post feel thoughtful and native to LinkedIn."
  ],
  reddit: [
    "Avoid promotional or sales language completely.",
    "Do not directly pitch a product or service.",
    "Frame the post as an observation, experience, or discussion starter.",
    "Lead with value before any mention of the product.",
    "Use a natural human tone, not corporate marketing language.",
    "Encourage discussion and be transparent about uncertainty."
  ],
  email: [
    "Include a clear subject line and preview text.",
    "Keep the body concise and easy to scan.",
    "Use 2 to 3 short paragraphs maximum.",
    "Focus on one clear message or action.",
    "Use a direct professional tone and end with an explicit CTA."
  ],
  blog: [
    "Start with a clear problem, use case, or context.",
    "Maintain a logical flow: intro, explanation, value, conclusion.",
    "Use medium-length readable paragraphs.",
    "Explain features through real usage, not abstract claims.",
    "Be informative and useful, not purely promotional."
  ]
};

export function normalizeSocialPlatform(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SOCIAL_PLATFORMS.includes(normalized) ? normalized : "twitter";
}

export function getSocialPlatformLabel(value) {
  const normalized = normalizeSocialPlatform(value);
  return SOCIAL_PLATFORM_LABELS[normalized];
}

export function getSocialPlatformShortLabel(value) {
  const normalized = normalizeSocialPlatform(value);
  return SOCIAL_PLATFORM_SHORT_LABELS[normalized];
}

export function buildPlatformInstructionBlock(socialPlatform) {
  const normalized = normalizeSocialPlatform(socialPlatform);
  const sections = [
    `SOCIAL PLATFORM TARGET: ${normalized.toUpperCase()}`,
    "",
    "BLOG RULES:",
    ...PLATFORM_RULES.blog.map((rule) => `- ${rule}`),
    "",
    `${getSocialPlatformLabel(normalized).toUpperCase()} RULES:`,
    ...PLATFORM_RULES[normalized].map((rule) => `- ${rule}`),
    "",
    "EMAIL RULES:",
    ...PLATFORM_RULES.email.map((rule) => `- ${rule}`)
  ];

  return sections.join("\n");
}
