import { supabase } from "@/integrations/supabase/client";

/**
 * Modo suporte: o operador da plataforma entra na conta de um cliente como
 * admin, por até 8 horas. "Ver conta" é só leitura; "Configurar conta" libera
 * a escrita para preparar a conta (ex.: antes de uma demonstração). Entrada e
 * saída ficam no audit_log da empresa, com o modo usado. Regras em
 * supabase/migrations/20261016090000_support_access.sql e
 * 20261022090000_demo_e_configuracao.sql.
 */
export interface SupportSession {
  orgId: string;
  orgName: string;
  until: string;
  canEdit: boolean;
}

// As funções novas ainda não estão nos tipos gerados do Supabase.
type Row = { org_id: string; org_name: string; until: string; can_edit?: boolean };
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: Row[] | null; error: { message: string } | null }>;

export async function supportSession(): Promise<SupportSession | null> {
  const { data, error } = await rpc("platform_support_session");
  if (error || !data?.length) return null;
  return { orgId: data[0].org_id, orgName: data[0].org_name, until: data[0].until, canEdit: !!data[0].can_edit };
}

export async function enterSupport(orgId: string, edit = false): Promise<void> {
  const { error } = await rpc("platform_support_enter", { _org_id: orgId, _edit: edit });
  if (error) throw new Error(error.message);
}

export async function exitSupport(): Promise<void> {
  const { error } = await rpc("platform_support_exit");
  if (error) throw new Error(error.message);
}
