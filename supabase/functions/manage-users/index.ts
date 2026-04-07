import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isMissingAuthUserError = (error: any) =>
  error?.message?.includes("User not found") ||
  error?.status === 404 ||
  error?.code === "user_not_found";

const cleanupOrphanUserRecords = async (adminClient: any, userId: string) => {
  const [{ error: profileError }, { error: roleError }] = await Promise.all([
    adminClient.from("profiles").delete().eq("user_id", userId),
    adminClient.from("user_roles").delete().eq("user_id", userId),
  ]);

  if (profileError) throw profileError;
  if (roleError) throw roleError;
};

const getManagedAuthUser = async (adminClient: any, userId: string) => {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);

  if (error) {
    if (isMissingAuthUserError(error)) {
      return null;
    }

    throw error;
  }

  return data.user;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user: caller },
    } = await anonClient.auth.getUser();

    if (!caller) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return jsonResponse({ error: "Apenas administradores podem gerenciar usuários" }, 403);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    if (action === "list_users") {
      const [
        { data: profiles, error: profilesError },
        { data: roles, error: rolesError },
        { data: authUsersResponse, error: authUsersError },
      ] = await Promise.all([
        adminClient
          .from("profiles")
          .select("id, user_id, full_name, avatar_url, team_id, created_at"),
        adminClient.from("user_roles").select("user_id, role"),
        adminClient.auth.admin.listUsers(),
      ]);

      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;
      if (authUsersError) throw authUsersError;

      const authUsers = authUsersResponse?.users || [];
      const authUserMap = new Map(authUsers.map((user: any) => [user.id, user]));
      const orphanUserIds = (profiles || [])
        .filter((profile: any) => !authUserMap.has(profile.user_id))
        .map((profile: any) => profile.user_id);

      if (orphanUserIds.length > 0) {
        const [{ error: profileCleanupError }, { error: roleCleanupError }] = await Promise.all([
          adminClient.from("profiles").delete().in("user_id", orphanUserIds),
          adminClient.from("user_roles").delete().in("user_id", orphanUserIds),
        ]);

        if (profileCleanupError) throw profileCleanupError;
        if (roleCleanupError) throw roleCleanupError;
      }

      const enriched = (profiles || [])
        .filter((profile: any) => authUserMap.has(profile.user_id))
        .map((profile: any) => {
          const userRole = roles?.find((roleItem: any) => roleItem.user_id === profile.user_id);
          const authUser = authUserMap.get(profile.user_id);

          return {
            ...profile,
            role: userRole?.role || "vendedor",
            email: authUser?.email || "",
          };
        });

      return jsonResponse({ users: enriched });
    }

    if (action === "create_user") {
      const { email, password, full_name, role, team_id } = body;

      if (!email || !password || !full_name) {
        return jsonResponse({ error: "Email, senha e nome são obrigatórios" }, 400);
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) throw createError;

      if (team_id) {
        const { error: profileError } = await adminClient
          .from("profiles")
          .update({ team_id })
          .eq("user_id", newUser.user.id);

        if (profileError) throw profileError;
      }

      if (role && role !== "vendedor") {
        const { error: roleError } = await adminClient
          .from("user_roles")
          .update({ role })
          .eq("user_id", newUser.user.id);

        if (roleError) throw roleError;
      }

      return jsonResponse({ success: true, user_id: newUser.user.id });
    }

    if (action === "update_role") {
      const { user_id, role } = body;
      if (!user_id || !role) {
        return jsonResponse({ error: "user_id e role são obrigatórios" }, 400);
      }

      const managedUser = await getManagedAuthUser(adminClient, user_id);
      if (!managedUser) {
        await cleanupOrphanUserRecords(adminClient, user_id);
        return jsonResponse({
          error: "Este usuário não existe mais no sistema de login e foi removido da lista.",
          code: "USER_NOT_FOUND",
          orphan_cleaned: true,
        });
      }

      const { error } = await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", user_id);

      if (error) throw error;

      return jsonResponse({ success: true });
    }

    if (action === "reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return jsonResponse({ error: "user_id e nova senha são obrigatórios" }, 400);
      }

      const managedUser = await getManagedAuthUser(adminClient, user_id);
      if (!managedUser) {
        await cleanupOrphanUserRecords(adminClient, user_id);
        return jsonResponse({
          error: "Este usuário não existe mais no sistema de login e foi removido da lista.",
          code: "USER_NOT_FOUND",
          orphan_cleaned: true,
        });
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        password: new_password,
      });

      if (error) throw error;

      return jsonResponse({ success: true });
    }

    if (action === "delete_user") {
      const { user_id } = body;
      if (!user_id) {
        return jsonResponse({ error: "user_id é obrigatório" }, 400);
      }

      if (user_id === caller.id) {
        return jsonResponse({ error: "Você não pode deletar sua própria conta" }, 400);
      }

      const managedUser = await getManagedAuthUser(adminClient, user_id);

      if (managedUser) {
        const { error } = await adminClient.auth.admin.deleteUser(user_id);
        if (error && !isMissingAuthUserError(error)) throw error;
      }

      await cleanupOrphanUserRecords(adminClient, user_id);

      return jsonResponse({ success: true, orphan_cleaned: true });
    }

    return jsonResponse({ error: "Ação inválida" }, 400);
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
});