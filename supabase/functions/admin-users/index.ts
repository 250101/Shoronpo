import { createClient } from "npm:@supabase/supabase-js@2";

const allowedRoles = new Set([
  "ADMINISTRADOR",
  "DIRECCION",
  "OBRADOR",
  "RESTAURANTE",
]);
const allowedOrigin = Deno.env.get("ADMIN_APP_ORIGIN") ?? "";
const inviteRedirect = Deno.env.get("ADMIN_INVITE_REDIRECT_URL") ?? "";

function response(body: unknown, status = 200, origin = "") {
  if (status === 204) {
    return new Response(null, {
      status,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, apikey, content-type",
        "access-control-allow-methods": "POST, OPTIONS",
        "vary": "Origin",
      },
    });
  }
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
      "vary": "Origin",
    },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigin || origin !== allowedOrigin) {
    return response({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  if (request.method === "OPTIONS") return response({}, 204, origin);
  if (request.method !== "POST") {
    return response({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
  }
  if (!inviteRedirect) {
    return response({ error: "SERVER_NOT_CONFIGURED" }, 503, origin);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!token) return response({ error: "UNAUTHORIZED" }, 401, origin);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await adminClient.auth.getUser(
    token,
  );
  if (userError || !userResult.user) {
    return response({ error: "UNAUTHORIZED" }, 401, origin);
  }
  const { data: authorized, error: authorizationError } = await userClient.rpc(
    "is_admin_aal2",
  );
  if (authorizationError || authorized !== true) {
    return response({ error: "MFA_ADMIN_REQUIRED" }, 403, origin);
  }

  let payload: { email?: string; displayName?: string; role?: string };
  try {
    payload = await request.json();
  } catch {
    return response({ error: "INVALID_JSON" }, 400, origin);
  }
  const email = payload.email?.trim().toLowerCase() ?? "";
  const displayName = payload.displayName?.trim() ?? "";
  const role = payload.role?.trim().toUpperCase() ?? "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2 ||
    displayName.length > 120 || !allowedRoles.has(role)
  ) {
    return response({ error: "INVALID_INPUT" }, 400, origin);
  }

  const { data: invitation, error: inviteError } = await adminClient.auth.admin
    .inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo: inviteRedirect,
    });
  if (inviteError || !invitation.user) {
    console.error("ADMIN_INVITE_FAILED", inviteError?.code ?? "unknown");
    return response({ error: "INVITE_FAILED" }, 502, origin);
  }
  const { error: roleError } = await userClient.rpc("grant_role", {
    p_user_id: invitation.user.id,
    p_role_code: role,
  });
  if (roleError) {
    console.error("ADMIN_ROLE_GRANT_FAILED", roleError.code ?? "unknown");
    return response(
      { error: "INVITED_WITHOUT_ROLE", userId: invitation.user.id },
      500,
      origin,
    );
  }
  return response({ ok: true, userId: invitation.user.id }, 201, origin);
});
