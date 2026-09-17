import { createFileRoute } from "@tanstack/react-router";

// The self-hosted Supabase instance is only reachable over plain HTTP, while the
// app is served over HTTPS. Browsers block that (mixed content), so all browser
// traffic is proxied through this same-origin endpoint.

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "content-encoding",
]);

async function proxy({ request, params }: { request: Request; params: { _splat?: string } }) {
  const supabaseUrl = process.env["MY_SUPABASE_URL"];
  const publishableKey = process.env["MY_SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !publishableKey) {
    return Response.json({ message: "Database configuration is unavailable." }, { status: 503 });
  }

  const url = new URL(request.url);
  const path = params._splat ?? "";
  const target = `${supabaseUrl.replace(/\/$/, "")}/${path}${url.search}`;

  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
  });
  const incomingApiKey = headers.get("apikey");
  const incomingAuthorization = headers.get("authorization");
  headers.set("apikey", publishableKey);
  if (!incomingAuthorization || incomingAuthorization === `Bearer ${incomingApiKey}`) {
    headers.set("authorization", `Bearer ${publishableKey}`);
  }

  const method = request.method.toUpperCase();
  const body: BodyInit | null =
    method === "GET" || method === "HEAD" ? null : await request.arrayBuffer();

  // The database server can briefly drop connections while it restarts, which
  // surfaced as 502/503/504 in the app. Retry once before giving up.
  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body, redirect: "manual" });
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      upstream = await fetch(target, { method, headers, body, redirect: "manual" });
    } catch {
      return Response.json(
        { message: "Database sedang tidak dapat dihubungi. Coba lagi sebentar lagi." },
        { status: 503 },
      );
    }
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) responseHeaders.set(name, value);
  });

  // A HEAD response must not carry a body; forwarding one makes the browser
  // abort the request (PostgREST count queries use HEAD).
  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const Route = createFileRoute("/api/public/db/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PUT: proxy,
      PATCH: proxy,
      DELETE: proxy,
      OPTIONS: proxy,
      HEAD: proxy,
    },
  },
});
