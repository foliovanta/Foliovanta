import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Requires authentication only. Role/permission authorization is ALWAYS enforced
// server-side in services and route handlers (resolveAdminActor / requirePermission)
// — middleware is defense in depth, never the authority. /admin and /api/admin are
// listed so anonymous users are redirected/blocked before reaching the app layer.
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/editor(.*)",
  "/preview(.*)",
  "/admin(.*)",
  "/api/admin(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
