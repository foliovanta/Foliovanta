import type { MetadataRoute } from "next";

import { getPublicOrigin } from "@/lib/urls/public-url";

// Keeps crawlers out of private app + private API routes. This is discoverability
// hygiene, NOT access control — authentication (middleware) and per-request
// authorization (media proxy, owner-scoped services) protect the data. Public
// portfolio pages and the authorized media proxy (/api/media) stay crawlable.
export default function robots(): MetadataRoute.Robots {
  const origin = getPublicOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/editor",
          "/preview",
          "/admin",
          "/sign-in",
          "/sign-up",
          "/api/portfolios",
          "/api/auth",
          "/api/webhooks",
          "/api/internal",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
