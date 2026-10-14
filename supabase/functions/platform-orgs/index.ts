// Painel do provedor: criar, listar, suspender e reativar organizações, e ver
// o consumo de cada uma.
//
// Acesso restrito a quem está em platform_admins. Deliberadamente NÃO expõe
// conteúdo de reunião, transcrição ou base de conhecimento de nenhum cliente —
// o operador do SaaS vê metadados e consumo, não as conversas.

import { json, preflight } from "../_shared/cors.ts";
import { adminClient, ANON_KEY, SUPABASE_URL, writeAudit } from "../_shared/tenant.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { crmOverview } from "../_shared/crm/overview.ts";

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

    // Integrações com CRM: só conexão e contagens de envio, sem conteúdo de reunião.
    if (action === "crm_overview") {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const [{ data: conns, error: e1 }, { data: maps, error: e2 }, { data: jobs, error: e3 }] = await Promise.all([
        admin.from("crm_connections").select("org_id, provider, status, account_label, connected_at, last_error"),
        admin.from("crm_field_mappings").select("org_id, provider"),
        admin.from("crm_sync_jobs").select("org_id, status, updated_at, last_error").gte("updated_at", since).limit(20000),
      ]);
      if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
      return json(req, { crm: crmOverview(conns ?? [], maps ?? [], jobs ?? []) });
    }

    // Põe de volta na fila os envios com erro dos últimos 30 dias (ex.: depois
    // de uma instabilidade do CRM). A crm-sync manda em até 10 minutos.
    if (action === "crm_retry_errors") {
      const { org_id } = body;
      if (!org_id) return json(req, { error: "org_id é obrigatório" }, 400);
      const { data: conn } = await admin.from("crm_connections").select("id, status")
        .eq("org_id", org_id).neq("status", "desconectado").maybeSingle();
      if (!conn) return json(req, { error: "Essa empresa não tem CRM conectado." }, 409);
      if (conn.status !== "ativo") {
        return json(req, { error: "A conexão com o CRM precisa ser refeita por um admin da empresa antes de tentar de novo." }, 409);
      }
      const now = new Date().toISOString();
      const { data: requeued, error } = await admin.from("crm_sync_jobs")
        .update({ status: "pendente", attempts: 0, next_attempt_at: now, updated_at: now })
        .eq("org_id", org_id).eq("status", "erro")
        .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString())
        .select("id");
      if (error) throw error;

      await writeAudit(admin, {
        orgId: org_id,
        actorUserId: user.id,
        action: "crm.retry_errors",
        entity: "crm_connections",
        entityId: conn.id,
        metadata: { jobs: requeued?.length ?? 0 },
      });
      return json(req, { success: true, requeued: requeued?.length ?? 0 });
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
