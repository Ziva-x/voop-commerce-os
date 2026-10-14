import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: [
        "/app/",
        "/api/",
        "/login",
        "/billing",
        "/settings",
        "/register",
        "/onboarding",
        "/subscribe",
        "/embedded-logout",
      ],
    },
  };
}
