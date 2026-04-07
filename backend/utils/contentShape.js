export function normalizeCampaignContent(content) {
  if (!content || typeof content !== "object") {
    return {
      blogTitle: "",
      blog: "",
      tweets: [],
      email: ""
    };
  }

  return {
    blogTitle:
      typeof content.blogTitle === "string"
        ? content.blogTitle.trim()
        : typeof content.blog_title === "string"
        ? content.blog_title.trim()
        : typeof content.title === "string"
        ? content.title.trim()
        : "",
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
    blogTitle: primary.blogTitle || fallback.blogTitle,
    blog: primary.blog || fallback.blog,
    tweets: primary.tweets.length ? primary.tweets : fallback.tweets,
    email: primary.email || fallback.email
  };
}
