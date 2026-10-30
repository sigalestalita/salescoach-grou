// Falhas de conta na AssemblyAI (sem crédito ou chave inválida).
//
// Sem crédito, a AssemblyAI recusa tudo: as dicas ao vivo não ligam e as
// reuniões terminam em erro na transcrição. Antes, ninguém sabia até alguém
// reclamar no meio de uma reunião. Agora os operadores da plataforma recebem
// um e-mail na hora (no máximo um a cada 6 horas) e a mensagem para o
// usuário diz o que aconteceu.

// deno-lint-ignore-file no-explicit-any

const INTERVALO_MS = 6 * 60 * 60 * 1000;

export const MSG_SEM_CREDITO =
  "A transcrição está sem crédito no momento. O administrador da plataforma já foi avisado; reprocesse esta reunião assim que o crédito voltar.";
export const MSG_SEM_CREDITO_AO_VIVO =
  "Transcrição sem crédito no momento. O administrador da plataforma já foi avisado por e-mail.";

/** A resposta da AssemblyAI indica problema de conta (saldo ou chave), não da reunião. */
export function falhaDeConta(status: number, corpo: string): boolean {
  if (status === 401 || status === 402) return true;
  return /balance|top.?up|insufficient|payment required|billing|invalid api key|authentication error/i.test(corpo);
}

/** Avisa os operadores da plataforma por e-mail. Nunca lança: o aviso não pode derrubar quem chamou. */
export async function avisarFalhaDeConta(admin: any, origem: string, detalhe: string): Promise<void> {
  try {
    if (!(await reservar(admin, "assemblyai_conta", detalhe))) return;
    const key = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("ALERTAS_FROM") || Deno.env.get("NOVIDADES_FROM");
    const para = await destinatarios(admin);
    if (!key || !from || !para.length) {
      console.error("aviso AssemblyAI não enviado (RESEND_API_KEY, remetente ou destinatários ausentes):", detalhe);
      return;
    }
    const texto =
      `A AssemblyAI recusou um pedido em ${origem}. Normalmente é falta de crédito.\n\n` +
      `Enquanto isso, as dicas ao vivo não ligam e as reuniões novas terminam em erro na transcrição.\n\n` +
      `O que fazer: adicionar crédito em https://www.assemblyai.com/app/account (Billing) e, ` +
      `de preferência, ligar a recarga automática. Depois, reprocessar as reuniões que ficaram com erro.\n\n` +
      `Resposta da AssemblyAI: ${detalhe.slice(0, 500)}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: para,
        subject: "Sales Coach: transcrição sem crédito na AssemblyAI",
        text: texto,
      }),
    });
    if (!res.ok) console.error("aviso AssemblyAI: Resend", res.status, (await res.text()).slice(0, 300));
  } catch (e) {
    console.error("aviso AssemblyAI:", e);
  }
}

/** true se este aviso pode sair agora (o último foi há mais de 6 horas, ou nunca). */
async function reservar(admin: any, chave: string, detalhe: string): Promise<boolean> {
  const agora = new Date();
  const { data: novo } = await admin.from("avisos_plataforma")
    .upsert({ chave, enviado_em: agora.toISOString(), detalhe }, { onConflict: "chave", ignoreDuplicates: true })
    .select("chave");
  if (novo?.length) return true;
  const corte = new Date(agora.getTime() - INTERVALO_MS).toISOString();
  const { data: vencido } = await admin.from("avisos_plataforma")
    .update({ enviado_em: agora.toISOString(), detalhe })
    .eq("chave", chave).lt("enviado_em", corte)
    .select("chave");
  return !!vencido?.length;
}

/** Operadores da plataforma, mais ALERTAS_EMAIL (separados por vírgula), se configurado. */
async function destinatarios(admin: any): Promise<string[]> {
  const extra = (Deno.env.get("ALERTAS_EMAIL") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const { data } = await admin.from("platform_admins").select("user_id");
  const emails = await Promise.all((data ?? []).map(async (r: { user_id: string }) => {
    const { data: u } = await admin.auth.admin.getUserById(r.user_id);
    return u?.user?.email ?? null;
  }));
  return [...new Set([...extra, ...emails.filter(Boolean)])] as string[];
}
