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
import { renderDemoWelcome } from "../_shared/demo-email.ts";
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

// ── E-mail de boas-vindas da demonstração ──

interface InviteRow { token: string; expires_at: string | null; email: string }

/**
 * Manda ao primeiro admin o e-mail de boas-vindas com o link do convite
 * (Resend: RESEND_API_KEY; remetente em DEMO_FROM ou NOVIDADES_FROM). O
 * comercial (COMERCIAL_EMAIL ou quem liberou a demo) recebe cópia e é o
 * "responder para". O link usa o endereço de onde a Plataforma foi aberta.
 */
async function sendDemoWelcome(
  admin: SupabaseClient,
  req: Request,
  p: { orgId: string; invite: InviteRow; adminName: string | null; operador: { id: string; email?: string | null } },
): Promise<{ sent: true; to: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("DEMO_FROM") || Deno.env.get("NOVIDADES_FROM") || "";
  const endereco = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (!key || !endereco) throw new Error("Configure RESEND_API_KEY e o remetente (NOVIDADES_FROM) para enviar e-mails.");

  const [{ data: org }, { data: marca }] = await Promise.all([
    admin.from("organizations").select("name, demo_ends_at").eq("id", p.orgId).single(),
    admin.from("organization_branding").select("product_name, logo_url, primary_hsl, support_email").eq("org_id", p.orgId).maybeSingle(),
  ]);
  const origem = req.headers.get("origin") ?? "";
  const appUrl = origem.startsWith("https://") ? origem : (Deno.env.get("APP_URL") || "https://salescoach.grougp.com.br");
  const comercial = Deno.env.get("COMERCIAL_EMAIL") || p.operador.email || null;
  const produto = marca?.product_name || "Sales Coach";
  const m = renderDemoWelcome({
    orgName: org?.name ?? "sua empresa",
    marca: { product_name: produto, logo_url: marca?.logo_url ?? null, primary_hsl: marca?.primary_hsl ?? null, support_email: marca?.support_email ?? null },
    adminName: p.adminName,
    inviteUrl: `${appUrl.replace(/\/$/, "")}/convite/${p.invite.token}`,
    inviteExpiresAt: p.invite.expires_at,
    demoEndsAt: org?.demo_ends_at ?? null,
    appUrl,
    comercialEmail: comercial,
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${produto.replace(/["<>]/g, "")} <${endereco}>`,
      to: [p.invite.email],
      ...(comercial ? { bcc: [comercial], reply_to: comercial } : {}),
      subject: m.subject,
      html: m.html,
      text: m.text,
    }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(`O Resend recusou o envio: ${d?.message ?? `HTTP ${res.status}`}`);
  }
  await writeAudit(admin, {
    orgId: p.orgId, actorUserId: p.operador.id, action: "organization.welcome_sent", entity: "organization", entityId: p.orgId,
    metadata: { to: p.invite.email },
  });
  return { sent: true, to: p.invite.email };
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
      const { name, slug, plan_key, product_name, admin_email, admin_role, admin_name, access_mode, demo_days, send_welcome } = body;
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

      // E-mail de boas-vindas com o convite (caixa marcada por padrão na Plataforma).
      let welcome = null;
      let welcome_error = null;
      if (invite && send_welcome) {
        try {
          welcome = await sendDemoWelcome(admin, req, {
            orgId: orgId as string,
            invite: { token: invite.token, expires_at: invite.expires_at, email: String(admin_email).toLowerCase() },
            adminName: admin_name ?? null,
            operador: user,
          });
        } catch (e) {
          welcome_error = e instanceof Error ? e.message : String(e);
        }
      }

      return json(req, { success: true, org_id: orgId, invite, demo_ends_at: demoEnd, welcome, welcome_error });
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

    // Boas-vindas de uma empresa já criada. Só pode haver um convite pendente
    // por e-mail na empresa (índice idx_invites_pending_email), e um convite
    // vencido sem aceite continua "pendente": o de admin válido é reaproveitado;
    // qualquer outro desse e-mail (vencido ou de outro papel) é revogado antes
    // de gerar o novo.
    if (action === "send_welcome") {
      const { org_id, admin_name } = body;
      const { data: pendentes } = await admin.from("organization_invites")
        .select("id, email, role, token, expires_at")
        .eq("org_id", org_id).is("accepted_at", null).is("revoked_at", null)
        .order("created_at", { ascending: false });
      const informado = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
      const alvo = informado ?? pendentes?.find((i) => i.role === "admin")?.email?.toLowerCase() ?? null;
      if (!alvo) return json(req, { error: "Informe o e-mail do administrador." }, 400);

      // Quem já tem conta não precisa de convite.
      const { data: contaId } = await admin.rpc("platform_user_id_by_email", { _email: alvo });
      if (contaId) {
        const { data: prof } = await admin.from("profiles").select("org_id").eq("user_id", contaId as string).maybeSingle();
        if (prof?.org_id === org_id) {
          return json(req, { error: `${alvo} já tem acesso a esta empresa e entra com a própria senha. Se esqueceu, use "Esqueci minha senha" no login ou gere uma senha nova em "Acesso do admin".` }, 400);
        }
        if (prof?.org_id) {
          return json(req, { error: `${alvo} já usa o Sales Coach em outra empresa. Use outro e-mail para o admin desta.` }, 400);
        }
      }

      const doEmail = (pendentes ?? []).filter((i) => i.email.toLowerCase() === alvo);
      let convite = doEmail.find((i) => i.role === "admin" && (!i.expires_at || new Date(i.expires_at) > new Date())) ?? null;
      if (!convite) {
        if (doEmail.length) {
          const { error: revErr } = await admin.from("organization_invites")
            .update({ revoked_at: new Date().toISOString() }).in("id", doEmail.map((i) => i.id));
          if (revErr) return json(req, { error: `Não foi possível trocar o convite antigo: ${revErr.message}` }, 400);
        }
        const { data: novo, error: novoErr } = await admin.from("organization_invites")
          .insert({ org_id, email: alvo, role: "admin", invited_by: user.id })
          .select("id, email, role, token, expires_at").single();
        if (novoErr || !novo) return json(req, { error: `Não foi possível criar o convite: ${novoErr?.message ?? ""}` }, 400);
        convite = novo;
      }
      try {
        const welcome = await sendDemoWelcome(admin, req, {
          orgId: org_id, invite: { token: convite.token, expires_at: convite.expires_at, email: convite.email.toLowerCase() },
          adminName: admin_name ?? null, operador: user,
        });
        return json(req, { success: true, welcome });
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

    // Atividade dos usuários de todas as empresas (só metadados; ver
    // 20261030090000_atividade_plataforma.sql). Período de até 90 dias.
    if (action === "activity" || action === "activity_people") {
      const ate = body.ate ? new Date(body.ate) : new Date();
      let desde = body.desde ? new Date(body.desde) : new Date(ate.getTime() - 7 * 86400_000);
      if (isNaN(ate.getTime()) || isNaN(desde.getTime()) || desde >= ate) return json(req, { error: "Período inválido." }, 400);
      if (ate.getTime() - desde.getTime() > 90 * 86400_000) desde = new Date(ate.getTime() - 90 * 86400_000);
      if (action === "activity_people") {
        const { data, error } = await admin.rpc("platform_activity_people", { _desde: desde.toISOString(), _ate: ate.toISOString() });
        if (error) return json(req, { error: `A atividade ainda não está disponível (${error.message}). Aplique a migração 20261030090000_atividade_plataforma.sql.` }, 400);
        return json(req, { people: data ?? [] });
      }
      const tipos = ["login", "reuniao", "analise", "erro", "treino", "assistente", "admin"];
      const { data, error } = await admin.rpc("platform_activity", {
        _desde: desde.toISOString(), _ate: ate.toISOString(),
        _org: body.org_id || null,
        _email: typeof body.busca === "string" && body.busca.trim() ? body.busca.trim().slice(0, 100) : null,
        _tipo: tipos.includes(body.tipo) ? body.tipo : null,
        _limite: Math.min(Math.max(Number(body.limite) || 100, 1), 500),
        _offset: Math.max(Number(body.offset) || 0, 0),
      });
      if (error) return json(req, { error: `A atividade ainda não está disponível (${error.message}). Aplique a migração 20261030090000_atividade_plataforma.sql.` }, 400);
      return json(req, { events: data ?? [] });
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
