// Novidades da plataforma e o e-mail semanal com elas.
//
// POST, só para quem está em platform_admins (tela Plataforma):
//   { action: "list" }                                   novidades e o último envio
//   { action: "save", id?, title, body, cta_label, cta_path, audience }
//   { action: "set_status", id, status }                 rascunho | publicado | arquivado
//   { action: "delete", id }                             só rascunho
//   { action: "draft", notes?, days? }                   a IA rascunha a partir dos PRs
//                                                        da semana (GITHUB_TOKEN) e das notas
//   { action: "test_email" }                             manda o e-mail para quem pediu
//   { action: "send_now" }                               manda agora o e-mail da semana
// POST com o cabeçalho x-cron-secret = NOVIDADES_CRON_SECRET e { action: "cron" }:
//   o envio semanal (pg_cron, segunda de manhã). Sem novidade nova, não manda nada.
//
// Envio pelo Resend (RESEND_API_KEY, remetente em NOVIDADES_FROM), com a marca de
// cada empresa e link de descadastro (função email-preferences). email_sends
// garante um e-mail por pessoa por conjunto de novidades.
//
// verify_jwt = false (config.toml): o agendador não tem token de usuário; o
// acesso é conferido aqui (segredo do agendador ou administração da plataforma).

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { json, preflight } from "../_shared/cors.ts";
import { adminClient, ANON_KEY, SUPABASE_URL } from "../_shared/tenant.ts";
import {
  CTA_PATHS, draftPrompt, envioRef, Marca, MudancaFonte, Novidade, paraPapel, parseDrafts, renderEmail,
  unsubscribeToken,
} from "../_shared/novidades.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const DRAFT_MODEL = env("NOVIDADES_MODEL") || "google/gemini-3-flash-preview";
const APP_URL = env("APP_URL") || "https://salescoach.grougp.com.br";
const tokenSecret = () => env("EMAIL_TOKEN_SECRET") || env("CRM_TOKEN_KEY");
const ORGS_ATIVAS = ["trial", "active", "past_due"];
const MARCA_PADRAO: Marca = { product_name: "Sales Coach", logo_url: null, primary_hsl: null, support_email: null };

class Falha extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const body = await req.json().catch(() => ({}));
    const admin = adminClient();

    const cronSecret = env("NOVIDADES_CRON_SECRET");
    if (body.action === "cron") {
      if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) throw new Falha("Não autorizado", 401);
      return json(req, await enviarSemana(admin));
    }

    const user = await operador(req, admin);
    switch (body.action) {
      case "list": {
        const [{ data: itens }, { data: ultimos }] = await Promise.all([
          admin.from("product_updates").select("*").neq("status", "arquivado").order("created_at", { ascending: false }).limit(100),
          admin.from("email_sends").select("ref, status, created_at").eq("kind", "novidades").order("created_at", { ascending: false }).limit(500),
        ]);
        const envios = ultimos ?? [];
        const ultimo = envios[0]?.created_at ?? null;
        const doUltimo = ultimo ? envios.filter((e) => e.created_at.slice(0, 13) === ultimo.slice(0, 13)) : [];
        return json(req, {
          updates: itens ?? [],
          lastSend: ultimo ? { at: ultimo, sent: doUltimo.filter((e) => e.status === "enviado").length, failed: doUltimo.filter((e) => e.status === "erro").length } : null,
          resendConfigured: !!env("RESEND_API_KEY") && !!env("NOVIDADES_FROM"),
          githubConfigured: !!env("GITHUB_TOKEN"),
          cronConfigured: !!cronSecret,
        });
      }
      case "save": {
        const row = limpar(body);
        if (body.id) {
          const { data, error } = await admin.from("product_updates").update({ ...row, updated_at: new Date().toISOString() })
            .eq("id", body.id).select().single();
          if (error) throw new Falha(error.message);
          return json(req, { update: data });
        }
        const { data, error } = await admin.from("product_updates").insert({ ...row, source: "manual", created_by: user.id }).select().single();
        if (error) throw new Falha(error.message);
        return json(req, { update: data });
      }
      case "set_status": {
        const status = String(body.status);
        if (!["rascunho", "publicado", "arquivado"].includes(status)) throw new Falha("Status inválido.");
        const { data: atual } = await admin.from("product_updates").select("published_at").eq("id", body.id).maybeSingle();
        const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
        if (status === "publicado" && !atual?.published_at) patch.published_at = new Date().toISOString();
        const { data, error } = await admin.from("product_updates").update(patch).eq("id", body.id).select().single();
        if (error) throw new Falha(error.message);
        return json(req, { update: data });
      }
      case "delete": {
        const { error } = await admin.from("product_updates").delete().eq("id", body.id).eq("status", "rascunho");
        if (error) throw new Falha(error.message);
        return json(req, { ok: true });
      }
      case "draft": {
        const drafts = await rascunhar(String(body.notes ?? ""), Number(body.days) || 7);
        if (!drafts.length) return json(req, { updates: [], message: "A IA não achou mudanças que interessem aos usuários." });
        const { data, error } = await admin.from("product_updates")
          .insert(drafts.map((d) => ({ ...d, source: "ia", status: "rascunho", created_by: user.id }))).select();
        if (error) throw new Falha(error.message);
        return json(req, { updates: data });
      }
      case "test_email": {
        const novidades = await pendentes(admin);
        const lista = novidades.length ? novidades : await rascunhos(admin);
        if (!lista.length) throw new Falha("Nenhuma novidade publicada ou em rascunho para testar.");
        if (!user.email) throw new Falha("Sua conta não tem e-mail.");
        const { data: perfil } = await admin.from("profiles").select("full_name, org_id").eq("user_id", user.id).maybeSingle();
        const marcas = await marcasDe(admin, perfil?.org_id ? [perfil.org_id] : []);
        const marca = (perfil?.org_id && marcas.get(perfil.org_id)) || MARCA_PADRAO;
        await enviarLote([await montar({ userId: user.id, email: user.email, nome: perfil?.full_name ?? null, marca, novidades: lista, appUrl: APP_URL, teste: true })]);
        return json(req, { ok: true, to: user.email, count: lista.length });
      }
      case "send_now":
        return json(req, await enviarSemana(admin));
      default:
        throw new Falha("Ação desconhecida.");
    }
  } catch (e) {
    if (e instanceof Falha) return json(req, { error: e.message }, e.status);
    console.error("product-updates:", e);
    return json(req, { error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});

async function operador(req: Request, admin: SupabaseClient) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Falha("Não autorizado", 401);
  const { data: { user } } = await createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (!user) throw new Falha("Sessão inválida", 401);
  const { data: ok } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!ok) throw new Falha("Acesso restrito à administração da plataforma", 403);
  return user;
}

function limpar(b: Record<string, unknown>) {
  const title = String(b.title ?? "").trim().slice(0, 90);
  const body = String(b.body ?? "").trim().slice(0, 900);
  if (!title || !body) throw new Falha("Título e texto são obrigatórios.");
  const path = typeof b.cta_path === "string" && CTA_PATHS.includes(b.cta_path) ? b.cta_path : null;
  const label = typeof b.cta_label === "string" && b.cta_label.trim() ? b.cta_label.trim().slice(0, 40) : null;
  const papeis = Array.isArray(b.audience) ? b.audience.filter((r) => ["admin", "gestor", "vendedor"].includes(String(r))) : [];
  if (!papeis.length) throw new Falha("Escolha para quem é a novidade.");
  return { title, body, cta_path: path, cta_label: path ? label ?? "Ver na plataforma" : null, audience: papeis };
}

// ── Rascunho pela IA ──

async function rascunhar(notas: string, dias: number): Promise<Omit<Novidade, "id">[]> {
  const mudancas = await prsDaSemana(dias);
  if (!mudancas.length && !notas.trim()) {
    throw new Falha(env("GITHUB_TOKEN")
      ? `Nenhuma mudança publicada nos últimos ${dias} dias. Escreva nas anotações o que mudou.`
      : "Escreva nas anotações o que mudou (ou configure o GITHUB_TOKEN para a IA ler as mudanças da semana).");
  }
  const key = env("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const p = draftPrompt(mudancas, notas);
  const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: DRAFT_MODEL, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], temperature: 0.4 }),
  });
  if (!ai.ok) throw new Falha(ai.status === 402 ? "Créditos de IA esgotados." : `A IA não respondeu (HTTP ${ai.status}).`, 502);
  const data = await ai.json();
  return parseDrafts(data.choices?.[0]?.message?.content ?? "");
}

/** PRs juntados no principal nos últimos dias (título e descrição), se houver GITHUB_TOKEN. */
async function prsDaSemana(dias: number): Promise<MudancaFonte[]> {
  const token = env("GITHUB_TOKEN");
  if (!token) return [];
  const repo = env("GITHUB_REPO") || "sigalestalita/salescoach-grou";
  const desde = Date.now() - Math.min(Math.max(dias, 1), 31) * 86400_000;
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "novidades" },
  });
  if (!res.ok) throw new Falha(`O GitHub respondeu ${res.status}. Confira o GITHUB_TOKEN.`, 502);
  // deno-lint-ignore no-explicit-any
  const prs: any[] = await res.json();
  return prs
    .filter((p) => p.merged_at && new Date(p.merged_at).getTime() >= desde)
    .map((p) => ({
      titulo: String(p.title ?? ""),
      // Só o começo da descrição (o "por quê" e o "o que muda"), sem testes e rodapé.
      descricao: String(p.body ?? "").split(/\n## Testes|\n🤖/)[0].slice(0, 1500),
    }));
}

// ── Envio ──

const pendentes = async (admin: SupabaseClient): Promise<Novidade[]> =>
  ((await admin.from("product_updates").select("id, title, body, cta_label, cta_path, audience, published_at")
    .eq("status", "publicado").is("emailed_at", null).order("published_at")).data ?? []) as Novidade[];

const rascunhos = async (admin: SupabaseClient): Promise<Novidade[]> =>
  ((await admin.from("product_updates").select("id, title, body, cta_label, cta_path, audience")
    .eq("status", "rascunho").order("created_at").limit(4)).data ?? []) as Novidade[];

async function marcasDe(admin: SupabaseClient, orgIds: string[]): Promise<Map<string, Marca>> {
  if (!orgIds.length) return new Map();
  const { data } = await admin.from("organization_branding").select("org_id, product_name, logo_url, primary_hsl, support_email").in("org_id", orgIds);
  return new Map((data ?? []).map((b) => [b.org_id, { ...MARCA_PADRAO, ...b, product_name: b.product_name || MARCA_PADRAO.product_name }]));
}

interface Email {
  userId: string;
  ref: string;
  payload: Record<string, unknown>;
}

async function montar(p: {
  userId: string; email: string; nome: string | null; marca: Marca; novidades: Novidade[]; appUrl: string; teste?: boolean;
}): Promise<Email> {
  const unsub = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/email-preferences?t=${encodeURIComponent(await unsubscribeToken(p.userId, tokenSecret()))}`;
  const firstName = (p.nome ?? "").trim().split(/\s+/)[0] || null;
  const m = renderEmail({ novidades: p.novidades, marca: p.marca, appUrl: p.appUrl, unsubscribeUrl: unsub, firstName, teste: p.teste });
  const from = env("NOVIDADES_FROM");
  const endereco = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (!endereco) throw new Falha("Configure o remetente em NOVIDADES_FROM.");
  return {
    userId: p.userId,
    ref: envioRef(p.novidades),
    payload: {
      from: `${p.marca.product_name.replace(/["<>]/g, "")} <${endereco}>`,
      to: [p.email],
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(p.marca.support_email ? { reply_to: p.marca.support_email } : {}),
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    },
  };
}

/** Manda até 100 por chamada (limite do Resend). Devolve os ids na ordem, ou o erro. */
async function enviarLote(emails: Email[]): Promise<{ ok: boolean; ids: (string | null)[]; erro?: string }> {
  const key = env("RESEND_API_KEY");
  if (!key) throw new Falha("Configure a RESEND_API_KEY para enviar e-mails.");
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails.map((e) => e.payload)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = String(data?.message ?? `HTTP ${res.status}`);
    if (emails.length === 1) throw new Falha(`O Resend recusou o envio: ${erro}`, 502);
    return { ok: false, ids: emails.map(() => null), erro };
  }
  const ids = Array.isArray(data?.data) ? data.data.map((d: { id?: string }) => d.id ?? null) : [];
  return { ok: true, ids };
}

/** O e-mail da semana: novidades publicadas e ainda não enviadas, para quem usa a plataforma. */
async function enviarSemana(admin: SupabaseClient) {
  const novidades = await pendentes(admin);
  if (!novidades.length) return { sent: 0, failed: 0, skipped: 0, message: "Nenhuma novidade publicada para enviar." };
  // Quem deu erro numa tentativa anterior entra de novo (os enviados ficam de fora).
  await admin.from("email_sends").delete().eq("kind", "novidades").eq("status", "erro");

  const [{ data: papeis }, { data: orgs }, { data: perfis }, { data: prefs }] = await Promise.all([
    admin.from("user_roles").select("user_id, org_id, role"),
    admin.from("organizations").select("id, status, custom_domain"),
    admin.from("profiles").select("user_id, full_name"),
    admin.from("email_preferences").select("user_id, novidades").eq("novidades", false),
  ]);
  const orgOk = new Map((orgs ?? []).filter((o) => ORGS_ATIVAS.includes(o.status)).map((o) => [o.id, o]));
  const fora = new Set((prefs ?? []).map((p) => p.user_id));
  const nomes = new Map((perfis ?? []).map((p) => [p.user_id, p.full_name as string | null]));
  const marcas = await marcasDe(admin, [...orgOk.keys()]);

  // E-mails das contas (confirmados).
  const emails = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email && u.email_confirmed_at) emails.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }

  const fila: Email[] = [];
  const vistos = new Set<string>();
  for (const r of papeis ?? []) {
    if (vistos.has(r.user_id) || !orgOk.has(r.org_id) || fora.has(r.user_id) || !emails.has(r.user_id)) continue;
    vistos.add(r.user_id);
    const minhas = paraPapel(novidades, r.role);
    if (!minhas.length) continue;
    const org = orgOk.get(r.org_id)!;
    fila.push(await montar({
      userId: r.user_id, email: emails.get(r.user_id)!, nome: nomes.get(r.user_id) ?? null,
      marca: marcas.get(r.org_id) ?? MARCA_PADRAO, novidades: minhas,
      appUrl: org.custom_domain ? `https://${org.custom_domain}` : APP_URL,
    }));
  }

  let sent = 0, failed = 0, skipped = 0;
  for (let i = 0; i < fila.length; i += 100) {
    const lote = fila.slice(i, i + 100);
    // Reserva antes de mandar: quem já recebeu este conjunto fica de fora.
    const { data: reservados } = await admin.from("email_sends")
      .upsert(lote.map((e) => ({ user_id: e.userId, kind: "novidades", ref: e.ref, status: "enviando" })), { onConflict: "user_id,kind,ref", ignoreDuplicates: true })
      .select("user_id");
    const meus = new Set((reservados ?? []).map((r) => r.user_id));
    const enviar = lote.filter((e) => meus.has(e.userId));
    skipped += lote.length - enviar.length;
    if (!enviar.length) continue;
    const r = await enviarLote(enviar);
    for (const [j, e] of enviar.entries()) {
      await admin.from("email_sends").update(r.ok
        ? { status: "enviado", provider_id: r.ids[j] }
        : { status: "erro", error: r.erro?.slice(0, 500) }).eq("user_id", e.userId).eq("kind", "novidades").eq("ref", e.ref);
    }
    if (r.ok) sent += enviar.length; else failed += enviar.length;
    // Limite do Resend: 2 chamadas por segundo.
    await new Promise((ok) => setTimeout(ok, 600));
  }

  if (!failed) {
    await admin.from("product_updates").update({ emailed_at: new Date().toISOString() }).in("id", novidades.map((n) => n.id));
  }
  return { sent, failed, skipped, novidades: novidades.length };
}
