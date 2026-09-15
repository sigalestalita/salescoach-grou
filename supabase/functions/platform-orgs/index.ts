// Painel do provedor: criar, listar, suspender e reativar organizações, e ver
// o consumo de cada uma.
//
// Acesso restrito a quem está em platform_admins. Deliberadamente NÃO expõe
// conteúdo de reunião, transcrição ou base de conhecimento de nenhum cliente —
// o operador do SaaS vê metadados e consumo, não as conversas.

import { json, preflight } from "../_shared/cors.ts";
import { adminClient, ANON_KEY, SUPABASE_URL, writeAudit } from "../_shared/tenant.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, { error: "Não autorizado" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(req, { error: "Sessão inválida" }, 401);

    const admin = adminClient();
    const { data: isAdmin } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!isAdmin) {
      return json(req, { error: "Acesso restrito à administração da plataforma" }, 403);
    }

    const body = await req.json();
    const { action } = body;

    if (action === "list_orgs") {
      const { data: orgs, error } = await admin
        .from("organizations")
        .select("id, name, slug, custom_domain, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const enriched = await Promise.all(
        (orgs ?? []).map(async (org: { id: string }) => {
          const [{ count: users }, { count: meetings }, { data: sub }, { data: quota }] =
            await Promise.all([
              admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("org_id", org.id),
              admin.from("meetings").select("id", { count: "exact", head: true }).eq("org_id", org.id),
              admin.from("subscriptions").select("status, plan_id, current_period_end, plans(key, name)").eq("org_id", org.id).maybeSingle(),
              admin.rpc("org_quota_status", { _org_id: org.id }),
            ]);
          return { ...org, users, meetings, subscription: sub, usage: quota };
        }),
      );

      return json(req, { organizations: enriched });
    }

    if (action === "create_org") {
      const { name, slug, plan_key, product_name, admin_email, admin_role } = body;
      if (!name || !slug) {
        return json(req, { error: "Nome e subdomínio são obrigatórios" }, 400);
      }

      const { data: orgId, error } = await admin.rpc("provision_organization", {
        _name: name,
        _slug: slug,
        _plan_key: plan_key ?? null,
        _product_name: product_name ?? null,
      });

      if (error) return json(req, { error: error.message }, 400);

      // Convite do primeiro administrador da nova organização.
      let invite = null;
      if (admin_email) {
        const { data: inv, error: invErr } = await admin
          .from("organization_invites")
          .insert({
            org_id: orgId,
            email: String(admin_email).toLowerCase(),
            role: admin_role ?? "admin",
            invited_by: user.id,
          })
          .select("id, token, expires_at")
          .single();
        if (invErr) console.error("Falha ao criar convite inicial:", invErr.message);
        else invite = inv;
      }

      return json(req, { success: true, org_id: orgId, invite });
    }

    if (action === "set_status") {
      const { org_id, status } = body;
      if (!org_id || !status) {
        return json(req, { error: "org_id e status são obrigatórios" }, 400);
      }

      const { error } = await admin
        .from("organizations")
        .update({ status })
        .eq("id", org_id);
      if (error) throw error;

      await writeAudit(admin, {
        orgId: org_id,
        actorUserId: user.id,
        action: "organization.status_changed",
        entity: "organization",
        entityId: org_id,
        metadata: { status },
      });

      return json(req, { success: true });
    }

    if (action === "set_plan") {
      const { org_id, plan_key } = body;
      if (!org_id || !plan_key) {
        return json(req, { error: "org_id e plan_key são obrigatórios" }, 400);
      }

      const { data: plan } = await admin.from("plans").select("id").eq("key", plan_key).maybeSingle();
      if (!plan) return json(req, { error: "Plano não encontrado" }, 404);

      const { error } = await admin
        .from("subscriptions")
        .upsert({ org_id, plan_id: plan.id, status: "active" }, { onConflict: "org_id" });
      if (error) throw error;

      await writeAudit(admin, {
        orgId: org_id,
        actorUserId: user.id,
        action: "subscription.plan_changed",
        entity: "organization",
        entityId: org_id,
        metadata: { plan_key },
      });

      return json(req, { success: true });
    }

    if (action === "list_plans") {
      const { data, error } = await admin.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return json(req, { plans: data ?? [] });
    }

    return json(req, { error: "Ação inválida" }, 400);
  } catch (e: unknown) {
    console.error("platform-orgs error", e);
    return json(req, { error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
