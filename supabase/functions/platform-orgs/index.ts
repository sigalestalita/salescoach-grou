// Painel do provedor: criar, listar, suspender e reativar organizações, e ver
// o consumo de cada uma.
//
// Acesso restrito a quem está em platform_admins. Esta função só expõe
// metadados e consumo. O conteúdo de um cliente é visto pelo modo suporte
// (platform_support_enter), só leitura e com registro no audit_log.

import { json, preflight } from "../_shared/cors.ts";
import { adminClient, ANON_KEY, SUPABASE_URL, writeAudit } from "../_shared/tenant.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { crmOverview } from "../_shared/crm/overview.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

const MAX_DEMO_DAYS = 365;

/** Senha do primeiro acesso: 12 caracteres sem os que confundem (0/O, 1/l/I). */
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

function demoEndsAt(days: unknown): string | null {
  const n = Number(days);
  if (!days || !Number.isFinite(n) || n <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + Math.min(Math.round(n), MAX_DEMO_DAYS));
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

/**
 * Acesso do admin da empresa com senha gerada. Sem conta: cria o usuário já
 * confirmado, como admin da empresa. Com conta nesta empresa: gera uma senha
 * nova. Conta de outra empresa: recusa (o login mudaria de empresa).
 * A pessoa troca a senha no primeiro acesso (must_change_password).
 */
async function grantAdminAccess(
  admin: SupabaseClient,
  orgId: string,
  email: string,
  fullName: string | null,
): Promise<{ user_id: string; email: string; password: string; created: boolean }> {
  const password = generatePassword();
  const meta = { full_name: fullName || email.split("@")[0], must_change_password: true };

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: meta,
  });

  let userId: string;
  let isNew = true;
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
    // Já existe: só vale se for desta empresa (ou ainda sem empresa).
    const { data: found } = await admin.rpc("platform_user_id_by_email", { _email: email });
    if (!found) throw new Error("Esse e-mail já tem conta, mas não foi possível localizá-la.");
    userId = found as string;
    const { data: prof } = await admin.from("profiles").select("org_id").eq("user_id", userId).maybeSingle();
    if (prof?.org_id && prof.org_id !== orgId) {
      throw new Error("Esse e-mail já usa o Sales Coach em outra empresa. Use outro e-mail para o admin desta.");
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password, email_confirm: true, user_metadata: meta,
    });
    if (updErr) throw updErr;
    isNew = false;
  } else {
    userId = created.user.id;
  }

  const { error: profErr } = await admin.from("profiles")
    .upsert({ user_id: userId, org_id: orgId, full_name: meta.full_name }, { onConflict: "user_id" });
  if (profErr) throw profErr;
  const { error: roleErr } = await admin.from("user_roles")
    .upsert({ user_id: userId, org_id: orgId, role: "admin" }, { onConflict: "user_id,org_id,role" });
  if (roleErr) throw roleErr;

  return { user_id: userId, email, password, created: isNew };
}

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
        .select("id, name, slug, custom_domain, status, created_at, demo_ends_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Quem tem login em cada empresa, último acesso e convites. Sem a migração
      // de acessos aplicada, o painel segue sem essas informações.
      const [{ data: people, error: peopleErr }, { data: invites }] = await Promise.all([
        admin.rpc("platform_org_people"),
        admin.from("organization_invites").select("org_id, email, role, created_at, expires_at, accepted_at, revoked_at")
          .order("created_at", { ascending: false }).limit(2000),
      ]);
      if (peopleErr) console.warn("platform_org_people:", peopleErr.message);
      const byOrg = <T extends { org_id: string }>(rows: T[] | null, id: string) => (rows ?? []).filter((r) => r.org_id === id);

      const enriched = await Promise.all(
        (orgs ?? []).map(async (org: { id: string }) => {
          const [{ count: users }, { count: meetings }, { data: sub }, { data: quota }] =
            await Promise.all([
              admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("org_id", org.id),
              admin.from("meetings").select("id", { count: "exact", head: true }).eq("org_id", org.id),
              admin.from("subscriptions").select("status, plan_id, current_period_end, plans(key, name)").eq("org_id", org.id).maybeSingle(),
              admin.rpc("org_quota_status", { _org_id: org.id }),
            ]);
          return {
            ...org, users, meetings, subscription: sub, usage: quota,
            people: peopleErr ? null : byOrg(people as { org_id: string }[] | null, org.id).map(({ org_id: _o, ...p }) => p),
            invites: byOrg(invites, org.id).map(({ org_id: _o, ...i }) => i),
          };
        }),
      );

      return json(req, { organizations: enriched });
    }

    if (action === "create_org") {
      const { name, slug, plan_key, product_name, admin_email, admin_role, admin_name, access_mode, demo_days } = body;
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

      const demoEnd = demoEndsAt(demo_days);
      if (demoEnd) {
        await admin.from("organizations").update({ demo_ends_at: demoEnd }).eq("id", orgId);
      }

      await writeAudit(admin, {
        orgId: orgId as string,
        actorUserId: user.id,
        action: "organization.created",
        entity: "organization",
        entityId: orgId as string,
        metadata: { demo_ends_at: demoEnd, access_mode: admin_email ? (access_mode ?? "senha") : null },
      });

      // Primeiro admin com senha gerada (padrão) ou por convite.
      if (admin_email && access_mode !== "convite") {
        try {
          const access = await grantAdminAccess(admin, orgId as string, String(admin_email).trim().toLowerCase(), admin_name ?? null);
          return json(req, { success: true, org_id: orgId, access, demo_ends_at: demoEnd });
        } catch (e) {
          // A empresa já foi criada: o acesso pode ser gerado depois pelo painel.
          return json(req, {
            success: true, org_id: orgId, demo_ends_at: demoEnd,
            access_error: e instanceof Error ? e.message : String(e),
          });
        }
      }

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

      return json(req, { success: true, org_id: orgId, invite, demo_ends_at: demoEnd });
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

    // Prazo da demonstração: days > 0 define o fim a partir de hoje; days nulo
    // tira o prazo (vira cliente); end_now encerra agora.
    if (action === "set_demo") {
      const { org_id, days, end_now } = body;
      if (!org_id) return json(req, { error: "org_id é obrigatório" }, 400);
      const value = end_now ? new Date().toISOString() : demoEndsAt(days);
      const { error } = await admin.from("organizations").update({ demo_ends_at: value }).eq("id", org_id);
      if (error) throw error;
      await writeAudit(admin, {
        orgId: org_id,
        actorUserId: user.id,
        action: "organization.demo_changed",
        entity: "organization",
        entityId: org_id,
        metadata: { demo_ends_at: value },
      });
      return json(req, { success: true, demo_ends_at: value });
    }

    // Acesso do admin da empresa com senha gerada (cria ou gera senha nova).
    if (action === "admin_access") {
      const { org_id, email, full_name } = body;
      if (!org_id || !email) return json(req, { error: "org_id e email são obrigatórios" }, 400);
      const { data: org } = await admin.from("organizations").select("id").eq("id", org_id).maybeSingle();
      if (!org) return json(req, { error: "Empresa não encontrada" }, 404);
      try {
        const access = await grantAdminAccess(admin, org_id, String(email).trim().toLowerCase(), full_name ?? null);
        await writeAudit(admin, {
          orgId: org_id,
          actorUserId: user.id,
          action: access.created ? "user.created" : "user.password_reset",
          entity: "user",
          entityId: access.user_id,
          metadata: { role: "admin", by: "platform" },
        });
        return json(req, { success: true, access });
      } catch (e) {
        return json(req, { error: e instanceof Error ? e.message : String(e) }, 400);
      }
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
