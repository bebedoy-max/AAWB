import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachMySupabaseAuth } from "@/lib/my-auth-attacher";

// Maps the MY_SUPABASE_* secrets onto the server-side Supabase env names before
// any handler runs, so all server code uses our own Supabase instance.
const supabaseEnvMiddleware = createMiddleware().server(async ({ next }) => {
  const { applyMySupabaseEnv } = await import("./lib/my-supabase-env.server");
  applyMySupabaseEnv();
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachMySupabaseAuth],
  requestMiddleware: [supabaseEnvMiddleware, errorMiddleware, csrfMiddleware],
}));
