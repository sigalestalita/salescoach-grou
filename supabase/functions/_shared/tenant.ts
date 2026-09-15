// Contexto de organização para as edge functions.
//
// Toda função que toca dados de cliente resolve aqui quem está chamando, a que
// organização pertence e se a operação cabe na cota do plano. As funções usam
// service role para escrever, então o escopo de organização é responsabilidade
// explícita deste módulo — a RLS não protege chamadas com service role.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

export type AppRole = "admin" | "gestor" | "vendedor";

export interface CallerContext {
  userId: string;
  email: string | null;
  orgId: string;
  role: AppRole | null;
  teamId: string | null;
  admin: SupabaseClient;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Chamada função→função autenticada pelo segredo compartilhado. */
export function hasInternalSecret(req: Request): boolean {
  const expected = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const received = req.headers.get("x-internal-secret");
  if (!expected || !received) return false;
  return constantTimeEquals(expected, received);
}

/**
 * Chamada feita com a service role key. Só acontece entre funções do próprio
 * projeto — a chave nunca sai do servidor. Serve de alternativa enquanto
 * INTERNAL_FUNCTION_SECRET não estiver configurado.
 */
export function isServiceRoleCall(req: Request): boolean {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return constantTimeEquals(header.slice(7).trim(), SERVICE_ROLE_KEY);
}

/** Origem interna: segredo compartilhado ou service role. */
export function isInternalCall(req: Request): boolean {
  return hasInternalSecret(req) || isServiceRoleCall(req);
}

/**
 * Identifica o chamador e a organização dele. Lança HttpError quando o token é
 * inválido ou quando o usuário ainda não pertence a nenhuma organização.
 */
export async function getCaller(req: Request): Promise<CallerContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Não autorizado");
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new HttpError(401, "Sessão inválida");

  const admin = adminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id, team_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.org_id) {
    throw new HttpError(403, "Usuário sem organização. Solicite um convite ao administrador.");
  }

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    orgId: profile.org_id,
    role: (roleRow?.role as AppRole) ?? null,
    teamId: profile.team_id ?? null,
    admin,
  };
}

export function requireRole(ctx: CallerContext, ...roles: AppRole[]): void {
  if (!ctx.role || !roles.includes(ctx.role)) {
    throw new HttpError(403, "Permissão insuficiente para esta operação");
  }
}

/** A organização está ativa (não suspensa/cancelada)? */
export async function assertOrgActive(ctx: CallerContext): Promise<void> {
  const { data: org } = await ctx.admin
    .from("organizations")
    .select("status")
    .eq("id", ctx.orgId)
    .maybeSingle();

  if (!org || !["trial", "active", "past_due"].includes(org.status)) {
    throw new HttpError(402, "Assinatura inativa. Fale com o administrador da conta.");
  }
}

/**
 * Bloqueia a operação quando ela estoura o limite do plano. Um plano sem o
 * limite declarado — ou uma organização sem assinatura — é ilimitado.
 */
export async function assertQuota(
  admin: SupabaseClient,
  orgId: string,
  metric: string,
  requested = 1,
): Promise<void> {
  const { data, error } = await admin.rpc("check_org_quota", {
    _org_id: orgId,
    _metric: metric,
    _requested: requested,
  });

  if (error) {
    console.error("check_org_quota falhou; liberando a operação:", error.message);
    return;
  }

  if (data === false) {
    throw new HttpError(
      402,
      `Limite do plano atingido para "${metric}" neste ciclo. Ajuste o plano para continuar.`,
      "QUOTA_EXCEEDED",
    );
  }
}

export interface UsageRecord {
  orgId: string;
  userId?: string | null;
  meetingId?: string | null;
  operation:
    | "transcricao"
    | "analise"
    | "embedding"
    | "rag"
    | "generate_arguments"
    | "live_transcricao"
    | "live_coach"
    | "extracao_documento"
    | "storage";
  model?: string | null;
  provider?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  quantity?: number;
  unit?: string;
  estimatedCost?: number;
}

/** Grava consumo. Nunca derruba a operação principal em caso de falha. */
export async function logUsage(admin: SupabaseClient, usage: UsageRecord): Promise<void> {
  const { error } = await admin.from("api_usage_logs").insert({
    org_id: usage.orgId,
    user_id: usage.userId ?? null,
    meeting_id: usage.meetingId ?? null,
    operation_type: usage.operation,
    model_used: usage.model ?? "desconhecido",
    provider: usage.provider ?? null,
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    quantity: usage.quantity ?? 0,
    unit: usage.unit ?? null,
    estimated_cost: usage.estimatedCost ?? 0,
  });

  if (error) console.error("Falha ao registrar consumo:", error.message);
}

export async function writeAudit(
  admin: SupabaseClient,
  entry: {
    orgId: string;
    actorUserId?: string | null;
    action: string;
    entity?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("audit_log").insert({
    org_id: entry.orgId,
    actor_user_id: entry.actorUserId ?? null,
    action: entry.action,
    entity: entry.entity ?? null,
    entity_id: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
  });
  if (error) console.error("Falha ao registrar auditoria:", error.message);
}

/** Domínios próprios cadastrados, para liberar CORS. */
export async function customDomains(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from("organizations")
    .select("custom_domain")
    .not("custom_domain", "is", null);
  return (data ?? []).map((r: { custom_domain: string }) => r.custom_domain.toLowerCase());
}
