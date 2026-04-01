export function normalizeCampaignContent(content) {
  if (!content || typeof content !== "object") {
    return {
      blog: "",
      tweets: [],
      email: ""
    };
  }

  return {
    blog: typeof content.blog === "string" ? content.blog.trim() : "",
    tweets: Array.isArray(content.tweets) ? content.tweets.filter((item) => typeof item === "string" && item.trim()) : [],
    email:
      typeof content.email === "string"
        ? content.email.trim()
        : typeof content.emailTeaser === "string"
        ? content.emailTeaser.trim()
        : typeof content.email_teaser === "string"
        ? content.email_teaser.trim()
        : ""
  };
}

export function mergeCampaignContent(primaryContent, fallbackContent) {
  const primary = normalizeCampaignContent(primaryContent);
  const fallback = normalizeCampaignContent(fallbackContent);

  return {
    blog: primary.blog || fallback.blog,
    tweets: primary.tweets.length ? primary.tweets : fallback.tweets,
    email: primary.email || fallback.email
  };
}
