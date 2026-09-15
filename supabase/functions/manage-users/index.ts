// Gestão de usuários, restrita ao admin da própria organização.
//
// Duas mudanças relevantes: toda operação passa a ser verificada contra a
// organização do administrador (antes um admin conseguiria agir sobre qualquer
// usuário do banco), e o papel passa a ser criado explicitamente com o vínculo
// de organização — o gatilho de cadastro não concede mais papel automático.

import { json, preflight } from "../_shared/cors.ts";
import { getCaller, HttpError, requireRole, writeAudit } from "../_shared/tenant.ts";

const isMissingAuthUserError = (error: { message?: string; status?: number; code?: string } | null) =>
  error?.message?.includes("User not found") ||
  error?.status === 404 ||
  error?.code === "user_not_found";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    requireRole(ctx, "admin");

    const admin = ctx.admin;
    const orgId = ctx.orgId;
    const body = await req.json();
    const { action } = body;

    /** O usuário alvo pertence à organização do admin? */
    const assertSameOrg = async (userId: string) => {
      const { data } = await admin
        .from("profiles")
        .select("user_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (!data) throw new HttpError(404, "Usuário não encontrado nesta organização");
    };

    const cleanupOrphan = async (userId: string) => {
      await Promise.all([
        admin.from("profiles").delete().eq("user_id", userId).eq("org_id", orgId),
        admin.from("user_roles").delete().eq("user_id", userId).eq("org_id", orgId),
      ]);
    };

    if (action === "list_users") {
      const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
        await Promise.all([
          admin
            .from("profiles")
            .select("id, user_id, full_name, avatar_url, team_id, created_at")
            .eq("org_id", orgId),
          admin.from("user_roles").select("user_id, role").eq("org_id", orgId),
        ]);

      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;

      const roleMap = new Map((roles || []).map((r: { user_id: string; role: string }) => [r.user_id, r.role]));

      // Busca os e-mails apenas dos usuários desta organização.
      const enriched = await Promise.all(
        (profiles || []).map(async (profile: { user_id: string }) => {
          const { data: authUser } = await admin.auth.admin.getUserById(profile.user_id);
          return {
            ...profile,
            role: roleMap.get(profile.user_id) || null,
            email: authUser?.user?.email || "",
            missing_login: !authUser?.user,
          };
        }),
      );

      return json(req, { users: enriched.filter((u) => !u.missing_login) });
    }

    if (action === "create_user") {
      const { email, password, full_name, role, team_id } = body;

      if (!email || !password || !full_name) {
        return json(req, { error: "Email, senha e nome são obrigatórios" }, 400);
      }

      if (team_id) {
        const { data: team } = await admin
          .from("teams").select("id").eq("id", team_id).eq("org_id", orgId).maybeSingle();
        if (!team) return json(req, { error: "Time não pertence a esta organização" }, 400);
      }

      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) throw createError;

      // O gatilho cria o perfil sem organização; o vínculo é feito aqui.
      const { error: profileError } = await admin
        .from("profiles")
        .upsert(
          { user_id: newUser.user.id, org_id: orgId, team_id: team_id || null, full_name },
          { onConflict: "user_id" },
        );
      if (profileError) throw profileError;

      const { error: roleError } = await admin
        .from("user_roles")
        .upsert(
          { user_id: newUser.user.id, org_id: orgId, role: role || "vendedor" },
          { onConflict: "user_id,org_id,role" },
        );
      if (roleError) throw roleError;

      await writeAudit(admin, {
        orgId,
        actorUserId: ctx.userId,
        action: "user.created",
        entity: "user",
        entityId: newUser.user.id,
        metadata: { role: role || "vendedor" },
      });

      return json(req, { success: true, user_id: newUser.user.id });
    }

    if (action === "invite_user") {
      const { email, role, team_id } = body;
      if (!email) return json(req, { error: "Email é obrigatório" }, 400);

      if (team_id) {
        const { data: team } = await admin
          .from("teams").select("id").eq("id", team_id).eq("org_id", orgId).maybeSingle();
        if (!team) return json(req, { error: "Time não pertence a esta organização" }, 400);
      }

      const { data: invite, error: inviteError } = await admin
        .from("organization_invites")
        .insert({
          org_id: orgId,
          email: email.toLowerCase(),
          role: role || "vendedor",
          team_id: team_id || null,
          invited_by: ctx.userId,
        })
        .select("id, token, expires_at")
        .single();

      if (inviteError) throw inviteError;

      await writeAudit(admin, {
        orgId,
        actorUserId: ctx.userId,
        action: "invite.created",
        entity: "invite",
        entityId: invite.id,
        metadata: { email, role: role || "vendedor" },
      });

      // O envio do e-mail fica a cargo de quem operar o SaaS; o link é
      // devolvido para poder ser copiado agora.
      return json(req, {
        success: true,
        invite_id: invite.id,
        token: invite.token,
        expires_at: invite.expires_at,
      });
    }

    if (action === "list_invites") {
      const { data, error } = await admin
        .from("organization_invites")
        .select("id, email, role, expires_at, accepted_at, revoked_at, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json(req, { invites: data ?? [] });
    }

    if (action === "revoke_invite") {
      const { invite_id } = body;
      if (!invite_id) return json(req, { error: "invite_id é obrigatório" }, 400);
      const { error } = await admin
        .from("organization_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", invite_id)
        .eq("org_id", orgId);
      if (error) throw error;
      return json(req, { success: true });
    }

    if (action === "update_role") {
      const { user_id, role } = body;
      if (!user_id || !role) {
        return json(req, { error: "user_id e role são obrigatórios" }, 400);
      }

      await assertSameOrg(user_id);

      const { data: authUser } = await admin.auth.admin.getUserById(user_id);
      if (!authUser?.user) {
        await cleanupOrphan(user_id);
        return json(req, {
          error: "Este usuário não existe mais no sistema de login e foi removido da lista.",
          code: "USER_NOT_FOUND",
          orphan_cleaned: true,
        });
      }

      // Impede a organização ficar sem nenhum admin.
      if (role !== "admin") {
        const { count } = await admin
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("role", "admin");
        const { data: current } = await admin
          .from("user_roles").select("role").eq("org_id", orgId).eq("user_id", user_id).maybeSingle();
        if (current?.role === "admin" && (count ?? 0) <= 1) {
          return json(req, { error: "A organização precisa de pelo menos um administrador." }, 400);
        }
      }

      const { error } = await admin
        .from("user_roles")
        .upsert({ user_id, org_id: orgId, role }, { onConflict: "user_id,org_id,role" });
      if (error) throw error;

      // Um usuário tem um papel por organização: remove os demais.
      await admin
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("org_id", orgId)
        .neq("role", role);

      await writeAudit(admin, {
        orgId, actorUserId: ctx.userId, action: "user.role_changed",
        entity: "user", entityId: user_id, metadata: { role },
      });

      return json(req, { success: true });
    }

    if (action === "reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return json(req, { error: "user_id e nova senha são obrigatórios" }, 400);
      }

      await assertSameOrg(user_id);

      const { data: authUser } = await admin.auth.admin.getUserById(user_id);
      if (!authUser?.user) {
        await cleanupOrphan(user_id);
        return json(req, {
          error: "Este usuário não existe mais no sistema de login e foi removido da lista.",
          code: "USER_NOT_FOUND",
          orphan_cleaned: true,
        });
      }

      const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) throw error;

      await writeAudit(admin, {
        orgId, actorUserId: ctx.userId, action: "user.password_reset",
        entity: "user", entityId: user_id,
      });

      return json(req, { success: true });
    }

    if (action === "delete_user") {
      const { user_id } = body;
      if (!user_id) return json(req, { error: "user_id é obrigatório" }, 400);
      if (user_id === ctx.userId) {
        return json(req, { error: "Você não pode deletar sua própria conta" }, 400);
      }

      await assertSameOrg(user_id);

      const { data: authUser } = await admin.auth.admin.getUserById(user_id);
      if (authUser?.user) {
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error && !isMissingAuthUserError(error)) throw error;
      }

      await cleanupOrphan(user_id);

      await writeAudit(admin, {
        orgId, actorUserId: ctx.userId, action: "user.deleted",
        entity: "user", entityId: user_id,
      });

      return json(req, { success: true, orphan_cleaned: true });
    }

    return json(req, { error: "Ação inválida" }, 400);
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return json(req, { error: err.message, code: err.code }, err.status);
    }
    console.error("manage-users error:", err);
    return json(req, { error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
