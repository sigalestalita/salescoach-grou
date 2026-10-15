import { supabase } from "@/integrations/supabase/client";

/**
 * Modo suporte: o operador da plataforma vê a conta de um cliente como admin,
 * só leitura, por até 8 horas. Entrada e saída ficam no audit_log da empresa.
 * As regras estão em supabase/migrations/20261016090000_support_access.sql.
 */
export interface SupportSession {
  orgId: string;
  orgName: string;
  until: string;
}

// As funções novas ainda não estão nos tipos gerados do Supabase.
type Row = { org_id: string; org_name: string; until: string };
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: Row[] | null; error: { message: string } | null }>;

export async function supportSession(): Promise<SupportSession | null> {
  const { data, error } = await rpc("platform_support_session");
  if (error || !data?.length) return null;
  return { orgId: data[0].org_id, orgName: data[0].org_name, until: data[0].until };
}

export async function enterSupport(orgId: string): Promise<void> {
  const { error } = await rpc("platform_support_enter", { _org_id: orgId });
  if (error) throw new Error(error.message);
}

export async function exitSupport(): Promise<void> {
  const { error } = await rpc("platform_support_exit");
  if (error) throw new Error(error.message);
}
