import { normalizeCampaignContent } from "./contentShape.js";
import { normalizeSocialPlatform } from "./platformRules.js";

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function riskFromScore(score) {
  if (score >= 4) {
    return "high";
  }

  if (score >= 2) {
    return "medium";
  }

  return "low";
}

function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function extractEmailParts(email = "") {
  const text = String(email || "");
  const subject = text.match(/^subject:\s*(.+)$/im)?.[1]?.trim() || "";
  const preview = text.match(/^preview:\s*(.+)$/im)?.[1]?.trim() || "";
  const body = text
    .replace(/^subject:\s*.+$/im, "")
    .replace(/^preview:\s*.+$/im, "")
    .trim();

  return { subject, preview, body };
}

function evaluateBlog(blog = "") {
  const violations = [];
  let severity = 0;
  const wordCount = countWords(blog);
  const normalized = String(blog || "").toLowerCase();

  if (wordCount < 260) {
    violations.push("blog lacks enough depth for a strong article");
    severity += 2;
  }

  if (/revolutionary|game-changing|cutting-edge|unlock unprecedented|best-in-class/.test(normalized)) {
    violations.push("blog uses generic marketing language");
    severity += 1;
  }

  if ((blog.match(/!/g) || []).length > 4) {
    violations.push("blog relies on overly emphatic punctuation");
    severity += 1;
  }

  return {
    status: severity >= 2 ? "needs_work" : "pass",
    violations: uniqueStrings(violations),
    riskLevel: riskFromScore(severity)
  };
}

function evaluateEmail(email = "") {
  const violations = [];
  let severity = 0;
  const { subject, preview, body } = extractEmailParts(email);
  const bodyWords = countWords(body);
  const normalizedBody = body.toLowerCase();

  if (!subject) {
    violations.push("email is missing a subject line");
    severity += 3;
  }

  if (!preview) {
    violations.push("email is missing preview text");
    severity += 2;
  }

  if (bodyWords < 80) {
    violations.push("email body feels too short for a polished company message");
    severity += 1;
  } else if (bodyWords > 220) {
    violations.push("email body is longer than a concise teaser should be");
    severity += 1;
  }

  if (!/(learn more|explore|see how|get started|request|read more|visit|discover)/.test(normalizedBody)) {
    violations.push("email CTA is weak or missing");
    severity += 1;
  }

  return {
    status: severity >= 2 ? "needs_work" : "pass",
    violations: uniqueStrings(violations),
    riskLevel: riskFromScore(severity)
  };
}

function evaluateTwitter(tweets = []) {
  const violations = [];
  let severity = 0;
  const normalizedTweets = Array.isArray(tweets) ? tweets : [];
  const firstTweet = String(normalizedTweets[0] || "").trim();

  if (normalizedTweets.length !== 5) {
    violations.push("x thread should contain exactly 5 posts");
    severity += 3;
  }

  if (!firstTweet) {
    violations.push("x thread is missing its opening hook");
    severity += 3;
  } else {
    if (firstTweet.length < 45) {
      violations.push("opening x post is too short to land a clear hook");
      severity += 1;
    }

    if (firstTweet.length > 280) {
      violations.push("opening x post is too long for a clean hook");
      severity += 2;
    }

    if (/^(introducing|meet|our platform|our product|learn how)/i.test(firstTweet)) {
      violations.push("opening x post starts too generically and needs a stronger hook");
      severity += 1;
    }
  }

  if (normalizedTweets.some((tweet) => String(tweet || "").length > 300)) {
    violations.push("one or more x posts are too long for native platform pacing");
    severity += 2;
  }

  return {
    platform: "twitter",
    status: severity >= 2 ? "needs_work" : "pass",
    violations: uniqueStrings(violations),
    riskLevel: riskFromScore(severity)
  };
}

function evaluateLinkedIn(tweets = []) {
  const violations = [];
  let severity = 0;
  const post = String(Array.isArray(tweets) ? tweets[0] || "" : "").trim();

  if ((Array.isArray(tweets) ? tweets.length : 0) !== 1) {
    violations.push("linkedin output should be a single post, not a thread");
    severity += 3;
  }

  if (countWords(post) < 70) {
    violations.push("linkedin post is too short to feel thoughtful or credible");
    severity += 2;
  }

  if (/(gonna|wanna|crazy|insane|wild)/i.test(post)) {
    violations.push("linkedin tone is too casual for a professional post");
    severity += 1;
  }

  if ((post.match(/#/g) || []).length > 4) {
    violations.push("linkedin post uses too many hashtags");
    severity += 1;
  }

  return {
    platform: "linkedin",
    status: severity >= 2 ? "needs_work" : "pass",
    violations: uniqueStrings(violations),
    riskLevel: riskFromScore(severity)
  };
}

function evaluateReddit(tweets = []) {
  const violations = [];
  let severity = 0;
  const post = String(Array.isArray(tweets) ? tweets[0] || "" : "").trim();

  if ((Array.isArray(tweets) ? tweets.length : 0) !== 1) {
    violations.push("reddit output should be a single discussion-style post");
    severity += 3;
  }

  if (/(sign up|get started|book a demo|request a demo|contact us|visit our website|learn more|try now|explore the campaign|our solution|our product)/i.test(post)) {
    violations.push("reddit post contains promotional language");
    severity += 4;
  }

  if (!/[?]/.test(post) && !/(curious|wondering|has anyone|would love to hear|interested in how others)/i.test(post)) {
    violations.push("reddit post lacks a discussion angle");
    severity += 2;
  }

  if (/leading platform|best-in-class|revolutionary|cutting-edge/i.test(post)) {
    violations.push("reddit post sounds too corporate or hype-driven");
    severity += 2;
  }

  return {
    platform: "reddit",
    status: severity >= 2 ? "needs_work" : "pass",
    violations: uniqueStrings(violations),
    riskLevel: riskFromScore(severity)
  };
}

function evaluateSocial(tweets = [], socialPlatform = "twitter") {
  const normalized = normalizeSocialPlatform(socialPlatform);

  if (normalized === "linkedin") {
    return evaluateLinkedIn(tweets);
  }

  if (normalized === "reddit") {
    return evaluateReddit(tweets);
  }

  return evaluateTwitter(tweets);
}

function mergeReview(baseReview = {}, overrideReview = {}) {
  const violations = uniqueStrings([...(baseReview.violations || []), ...(overrideReview.violations || [])]);
  const riskLevels = ["low", "medium", "high"];
  const riskLevel =
    riskLevels[Math.max(riskLevels.indexOf(baseReview.riskLevel || "low"), riskLevels.indexOf(overrideReview.riskLevel || "low"))] || "low";

  return {
    ...baseReview,
    ...overrideReview,
    violations,
    riskLevel
  };
}

export function evaluateChannelCompliance(content, socialPlatform) {
  const normalized = normalizeCampaignContent(content);

  return {
    blog: evaluateBlog(normalized.blog),
    email: evaluateEmail(normalized.email),
    social: evaluateSocial(normalized.tweets, socialPlatform)
  };
}

export function normalizeEditorReviews(result = {}, content, socialPlatform) {
  const heuristic = evaluateChannelCompliance(content, socialPlatform);
  const modelChannelReviews = result?.channelReviews && typeof result.channelReviews === "object" ? result.channelReviews : {};
  const modelPlatformReview = result?.platformReview && typeof result.platformReview === "object" ? result.platformReview : {};
  const social = mergeReview(heuristic.social, {
    platform: normalizeSocialPlatform(modelPlatformReview.platform || socialPlatform),
    violations: Array.isArray(modelPlatformReview.violations) ? modelPlatformReview.violations : modelChannelReviews.social?.violations || [],
    riskLevel: modelPlatformReview.riskLevel || modelChannelReviews.social?.riskLevel || heuristic.social.riskLevel,
    status: modelChannelReviews.social?.status || heuristic.social.status
  });

  const blog = mergeReview(heuristic.blog, {
    violations: Array.isArray(modelChannelReviews.blog?.violations) ? modelChannelReviews.blog.violations : [],
    riskLevel: modelChannelReviews.blog?.riskLevel || heuristic.blog.riskLevel,
    status: modelChannelReviews.blog?.status || heuristic.blog.status
  });

  const email = mergeReview(heuristic.email, {
    violations: Array.isArray(modelChannelReviews.email?.violations) ? modelChannelReviews.email.violations : [],
    riskLevel: modelChannelReviews.email?.riskLevel || heuristic.email.riskLevel,
    status: modelChannelReviews.email?.status || heuristic.email.status
  });

  return {
    platformReview: social,
    channelReviews: {
      blog,
      social,
      email
    }
  };
}

export function buildChannelReviewFeedback(channelReviews) {
  const issues = [
    ...channelReviews.social.violations.slice(0, 2),
    ...channelReviews.blog.violations.slice(0, 1),
    ...channelReviews.email.violations.slice(0, 1)
  ];

  return issues.length ? uniqueStrings(issues).join("; ") : "";
}

export function hasBlockingChannelIssues(channelReviews) {
  return (
    channelReviews.social.riskLevel === "high" ||
    channelReviews.email.riskLevel === "high" ||
    channelReviews.blog.riskLevel === "high"
  );
}
