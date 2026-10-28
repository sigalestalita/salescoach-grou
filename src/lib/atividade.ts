// Painel de atividade da plataforma: tipos das linhas que a função
// platform-orgs devolve (ações activity e activity_people) e a saúde de cada
// empresa, calculada a partir do resumo por pessoa.

export type TipoEvento = "login" | "reuniao" | "analise" | "erro" | "treino" | "assistente" | "admin";

export interface Evento {
  em: string;
  tipo: TipoEvento;
  org_id: string | null;
  org_nome: string | null;
  user_id: string | null;
  email: string | null;
  nome: string | null;
  titulo: string;
  detalhe: string | null;
  ref: string | null;
}

export interface PessoaAtividade {
  org_id: string;
  org_nome: string | null;
  user_id: string;
  email: string;
  nome: string | null;
  papel: string | null;
  ultimo_login: string | null;
  logins: number;
  reunioes: number;
  analises: number;
  erros: number;
  treinos: number;
  assistente: number;
  custo: number;
  ultima_atividade: string | null;
  /** Versão da extensão do Chrome vista pela última vez e quando. */
  extensao_versao?: string | null;
  extensao_vista_em?: string | null;
}

export const TIPOS: { key: TipoEvento; label: string }[] = [
  { key: "login", label: "Login" },
  { key: "reuniao", label: "Reunião" },
  { key: "analise", label: "Análise" },
  { key: "erro", label: "Erro" },
  { key: "treino", label: "Treino" },
  { key: "assistente", label: "Assistente" },
  { key: "admin", label: "Administração" },
];

export type Saude = "saudavel" | "atencao" | "sem_uso";

export interface EmpresaSaude {
  org_id: string;
  org_nome: string;
  pessoas: number;
  ativos7: number;
  ativos30: number;
  reunioes: number;
  analises: number;
  erros: number;
  /** Erros sobre reuniões enviadas no período (0 a 1); null sem reunião. */
  taxaErro: number | null;
  custo: number;
  ultima: string | null;
  saude: Saude;
  motivo: string;
}

const DIA = 86_400_000;

/** O banco devolve bigint e numeric como texto em alguns casos: normaliza. */
export function normalizaPessoa(p: PessoaAtividade): PessoaAtividade {
  return {
    ...p,
    logins: Number(p.logins) || 0, reunioes: Number(p.reunioes) || 0, analises: Number(p.analises) || 0,
    erros: Number(p.erros) || 0, treinos: Number(p.treinos) || 0, assistente: Number(p.assistente) || 0,
    custo: Number(p.custo) || 0,
  };
}

export function ativoDesde(p: Pick<PessoaAtividade, "ultima_atividade">, dias: number, agora = new Date()): boolean {
  return !!p.ultima_atividade && agora.getTime() - new Date(p.ultima_atividade).getTime() <= dias * DIA;
}

/**
 * Saúde por empresa. Sem uso: ninguém ativo em 30 dias. Atenção: menos de um
 * terço do time ativo na semana, ou mais de 20% das reuniões com erro no
 * período. O resto é saudável. Ordena do pior para o melhor.
 */
export function saudePorEmpresa(pessoas: PessoaAtividade[], agora = new Date()): EmpresaSaude[] {
  const porOrg = new Map<string, PessoaAtividade[]>();
  for (const p of pessoas) {
    const l = porOrg.get(p.org_id) ?? [];
    l.push(p);
    porOrg.set(p.org_id, l);
  }
  const out: EmpresaSaude[] = [];
  for (const [org_id, ps] of porOrg) {
    const soma = (k: "reunioes" | "analises" | "erros" | "custo") => ps.reduce((s, p) => s + (Number(p[k]) || 0), 0);
    const reunioes = soma("reunioes"), erros = soma("erros");
    const ativos7 = ps.filter((p) => ativoDesde(p, 7, agora)).length;
    const ativos30 = ps.filter((p) => ativoDesde(p, 30, agora)).length;
    const taxaErro = reunioes ? Math.min(erros / reunioes, 1) : null;
    const ultima = ps.reduce<string | null>((m, p) => (p.ultima_atividade && (!m || p.ultima_atividade > m) ? p.ultima_atividade : m), null);
    let saude: Saude = "saudavel", motivo = `${ativos7} de ${ps.length} ativos na semana`;
    if (!ativos30) { saude = "sem_uso"; motivo = "Ninguém usou nos últimos 30 dias"; }
    else if (taxaErro !== null && taxaErro > 0.2) { saude = "atencao"; motivo = `${Math.round(taxaErro * 100)}% das reuniões com erro`; }
    else if (ativos7 / ps.length < 1 / 3) { saude = "atencao"; motivo = `Só ${ativos7} de ${ps.length} ativos na semana`; }
    out.push({
      org_id, org_nome: ps[0].org_nome ?? "—", pessoas: ps.length, ativos7, ativos30,
      reunioes, analises: soma("analises"), erros, taxaErro, custo: soma("custo"), ultima, saude, motivo,
    });
  }
  const ordem: Record<Saude, number> = { sem_uso: 0, atencao: 1, saudavel: 2 };
  return out.sort((a, b) => ordem[a.saude] - ordem[b.saude] || a.org_nome.localeCompare(b.org_nome, "pt-BR"));
}

/** "há 5 min", "há 3 h", "há 2 dias", "nunca". */
export function haQuanto(iso: string | null, agora = new Date()): string {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}
