import { createClient } from "npm:@supabase/supabase-js@2";

const allowedRoles = new Set([
  "ADMINISTRADOR",
  "DIRECCION",
  "OBRADOR",
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
        "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
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
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
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
  if (!["GET", "POST", "PATCH"].includes(request.method)) {
    return response({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
  }
  if (request.method === "POST" && !inviteRedirect) {
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

  const { data: claimsResult, error: claimsError } = await userClient.auth
    .getClaims(token);
  if (claimsError || !claimsResult?.claims?.sub) {
    console.error("ADMIN_AUTH_FAILED", claimsError?.code ?? "missing_claims");
    return response({ error: "UNAUTHORIZED" }, 401, origin);
  }
  const { data: authorized, error: authorizationError } = await userClient.rpc(
    "is_admin_aal2",
  );
  if (authorizationError || authorized !== true) {
    return response({ error: "MFA_ADMIN_REQUIRED" }, 403, origin);
  }

  if (request.method === "GET") {
    const users = [];
    let page = 1;
    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) {
        console.error("ADMIN_USERS_LIST_FAILED", error.code ?? "unknown");
        return response({ error: "LIST_FAILED" }, 502, origin);
      }
      users.push(...data.users);
      if (data.users.length < 200) break;
      page += 1;
    }

    const userIds = users.map((user) => user.id);
    const [{ data: profiles, error: profilesError }, { data: assignments, error: rolesError }] =
      await Promise.all([
        adminClient.from("profiles").select("user_id,display_name,is_active").in("user_id", userIds),
        adminClient.from("user_roles").select("user_id,roles!inner(code)").in("user_id", userIds),
      ]);
    if (profilesError || rolesError) {
      console.error("ADMIN_USERS_DATA_FAILED", profilesError?.code ?? rolesError?.code ?? "unknown");
      return response({ error: "LIST_FAILED" }, 502, origin);
    }
    const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    const rolesById = new Map<string, string[]>();
    for (const assignment of assignments ?? []) {
      const role = Array.isArray(assignment.roles) ? assignment.roles[0] : assignment.roles;
      if (!role?.code) continue;
      rolesById.set(assignment.user_id, [...(rolesById.get(assignment.user_id) ?? []), role.code]);
    }
    return response({
      ok: true,
      users: users.map((user) => {
        const profile = profileById.get(user.id);
        return {
          id: user.id,
          email: user.email ?? "",
          displayName: profile?.display_name ?? user.user_metadata?.display_name ?? "Usuario",
          isActive: profile?.is_active === true,
          roles: rolesById.get(user.id) ?? [],
          isSelf: user.id === claimsResult.claims.sub,
        };
      }).sort((a, b) => a.displayName.localeCompare(b.displayName, "es")),
    }, 200, origin);
  }

  let payload: { action?: string; userId?: string; email?: string; displayName?: string; role?: string; isActive?: boolean };
  try {
    payload = await request.json();
  } catch {
    return response({ error: "INVALID_JSON" }, 400, origin);
  }
  if (request.method === "PATCH") {
    const userId = payload.userId?.trim() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) ||
      userId === claimsResult.claims.sub) {
      return response({ error: "INVALID_TARGET" }, 400, origin);
    }
    if (payload.action === "set-role") {
      const role = payload.role?.trim().toUpperCase() ?? "";
      if (!allowedRoles.has(role)) return response({ error: "INVALID_INPUT" }, 400, origin);
      const { error } = await userClient.rpc("set_user_role", { p_user_id: userId, p_role_code: role });
      if (error) {
        console.error("ADMIN_ROLE_UPDATE_FAILED", error.code ?? "unknown");
        return response({ error: "UPDATE_FAILED" }, 409, origin);
      }
      return response({ ok: true }, 200, origin);
    }
    if (payload.action === "set-active" && typeof payload.isActive === "boolean") {
      const { error } = await userClient.from("profiles").update({ is_active: payload.isActive })
        .eq("user_id", userId).select("user_id").single();
      if (error) {
        console.error("ADMIN_STATUS_UPDATE_FAILED", error.code ?? "unknown");
        return response({ error: "UPDATE_FAILED" }, 409, origin);
      }
      return response({ ok: true }, 200, origin);
    }
    return response({ error: "INVALID_INPUT" }, 400, origin);
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
      data: { display_name: displayName, must_set_password: true },
      redirectTo: inviteRedirect,
    });
  if (inviteError || !invitation.user) {
    console.error("ADMIN_INVITE_FAILED", inviteError?.code ?? "unknown");
    const inviteCode = inviteError?.code ?? "";
    if (inviteCode.includes("rate_limit")) {
      return response({ error: "EMAIL_RATE_LIMIT" }, 429, origin);
    }
    if (inviteCode === "email_exists" || inviteCode === "user_already_exists") {
      return response({ error: "EMAIL_ALREADY_EXISTS" }, 409, origin);
    }
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
