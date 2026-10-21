import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/advisor-login/", "/advisor-signup/", "/advisor-profile/", "/users/", "/api/"] }],
    sitemap: "https://crb.changtechs.com/sitemap.xml",
  };
}
