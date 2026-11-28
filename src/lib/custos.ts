/**
 * Custos de sustentação das APIs (tela Plataforma → Custos de API).
 *
 * Entra o uso agregado do banco (platform_uso_apis): minutos da AssemblyAI,
 * tokens do Gemini e gravações do robô da Recall.ai, por empresa. Sai o custo
 * do período, o custo por usuário ativo por mês e uma projeção a partir de
 * premissas editáveis (usuários, reuniões, duração, uso do robô e do coach ao
 * vivo). Só regras aqui, sem banco nem tela, para testar.
 */

export interface Precos {
  /** R$ por US$. */
  cambio: number;
  /** AssemblyAI depois da reunião (Universal-2 + separação de vozes), US$ por hora. */
  assembly_gravacao_hora: number;
  /** AssemblyAI ao vivo (u3-rt-pro), US$ por hora de cada trilha. */
  assembly_ao_vivo_hora: number;
  /** Robô da Recall.ai, US$ por hora gravada. */
  recall_hora: number;
  /** Gemini, US$ por milhão de tokens. */
  gemini_flash_entrada: number;
  gemini_flash_saida: number;
  gemini_lite_entrada: number;
  gemini_lite_saida: number;
  gemini_pro_entrada: number;
  gemini_pro_saida: number;
  /** Multiplicador do gateway da Lovable sobre o preço do Google (1 = mesmo preço). */
  gateway_fator: number;
}

/** Preços de tabela em nov/2026 (Recall no plano Startup). Editáveis na tela; confira nas faturas. */
export const PRECOS_PADRAO: Precos = {
  cambio: 5.4,
  assembly_gravacao_hora: 0.17,
  assembly_ao_vivo_hora: 0.45,
  recall_hora: 0.25, // plano Startup da Recall.ai (tabela pública: 0,50)
  gemini_flash_entrada: 0.3,
  gemini_flash_saida: 2.5,
  gemini_lite_entrada: 0.1,
  gemini_lite_saida: 0.4,
  gemini_pro_entrada: 1.25,
  gemini_pro_saida: 10,
  gateway_fator: 1,
};

export const CAMPOS_PRECO: { key: keyof Precos; label: string; unidade: string }[] = [
  { key: "cambio", label: "Câmbio", unidade: "R$ por US$" },
  { key: "recall_hora", label: "Recall.ai (robô)", unidade: "US$ / hora gravada" },
  { key: "assembly_gravacao_hora", label: "AssemblyAI depois da reunião", unidade: "US$ / hora" },
  { key: "assembly_ao_vivo_hora", label: "AssemblyAI ao vivo", unidade: "US$ / hora por trilha" },
  { key: "gemini_flash_entrada", label: "Gemini Flash, entrada", unidade: "US$ / milhão de tokens" },
  { key: "gemini_flash_saida", label: "Gemini Flash, saída", unidade: "US$ / milhão de tokens" },
  { key: "gemini_lite_entrada", label: "Gemini Flash-Lite, entrada", unidade: "US$ / milhão de tokens" },
  { key: "gemini_lite_saida", label: "Gemini Flash-Lite, saída", unidade: "US$ / milhão de tokens" },
  { key: "gemini_pro_entrada", label: "Gemini Pro, entrada", unidade: "US$ / milhão de tokens" },
  { key: "gemini_pro_saida", label: "Gemini Pro, saída", unidade: "US$ / milhão de tokens" },
  { key: "gateway_fator", label: "Fator do gateway Lovable", unidade: "× preço do Google" },
];

/** Junta os preços salvos aos padrões (campo ausente ou inválido fica no padrão). */
export function comPadroes(salvos: Partial<Record<keyof Precos, unknown>> | null | undefined): Precos {
  const p = { ...PRECOS_PADRAO };
  for (const k of Object.keys(p) as (keyof Precos)[]) {
    const v = Number(salvos?.[k]);
    if (salvos && salvos[k] != null && Number.isFinite(v) && v >= 0) p[k] = v;
  }
  return p;
}

export interface EmpresaUso {
  org_id: string;
  nome: string;
  status?: string | null;
  usuarios: number;
  usuarios_ativos: number;
  reunioes: number;
  minutos: number;
  reunioes_robo: number;
  minutos_robo: number;
  reunioes_ao_vivo: number;
  minutos_ao_vivo: number;
}

export interface LinhaUso {
  org_id: string | null;
  provedor: string | null;
  operacao: string;
  modelo: string | null;
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  quantidade: number;
  unidade: string | null;
}

export interface Uso {
  desde: string;
  empresas: EmpresaUso[];
  uso: LinhaUso[];
}

export type Api = "recall" | "assembly_gravacao" | "assembly_ao_vivo" | "gemini";
export const APIS: { key: Api; nome: string }[] = [
  { key: "recall", nome: "Recall.ai (robô nas reuniões)" },
  { key: "assembly_gravacao", nome: "AssemblyAI (transcrição depois da reunião)" },
  { key: "assembly_ao_vivo", nome: "AssemblyAI (coach ao vivo)" },
  { key: "gemini", nome: "Gemini (análise, coach, assistente)" },
];

/** Operações de IA que acontecem por reunião (crescem com os minutos de reunião). */
const IA_DA_REUNIAO = new Set(["analise", "live_coach"]);

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function precoGemini(modelo: string | null, p: Precos): { entrada: number; saida: number } {
  const m = (modelo ?? "").toLowerCase();
  if (m.includes("lite")) return { entrada: p.gemini_lite_entrada, saida: p.gemini_lite_saida };
  if (m.includes("pro")) return { entrada: p.gemini_pro_entrada, saida: p.gemini_pro_saida };
  return { entrada: p.gemini_flash_entrada, saida: p.gemini_flash_saida };
}

// Texto com Gemini (direto ou pelo gateway da Lovable). Voz (TTS) e outros
// modelos do gateway ficam em "outros".
const ehGemini = (l: LinhaUso) => /gemini/i.test(l.modelo ?? "") && !/tts/i.test(l.modelo ?? "");

/** Custo em US$ de uma linha de uso; api null = fora das três APIs (CRM, armazenamento, voz…). */
export function custoDaLinha(l: LinhaUso, p: Precos): { api: Api | null; usd: number } {
  if (l.provedor === "assemblyai") {
    const ao = l.operacao === "live_transcricao";
    const hora = ao ? p.assembly_ao_vivo_hora : p.assembly_gravacao_hora;
    return { api: ao ? "assembly_ao_vivo" : "assembly_gravacao", usd: (num(l.quantidade) / 60) * hora };
  }
  if (ehGemini(l)) {
    const g = precoGemini(l.modelo, p);
    const usd = ((num(l.tokens_entrada) * g.entrada + num(l.tokens_saida) * g.saida) / 1e6) * p.gateway_fator;
    return { api: "gemini", usd };
  }
  return { api: null, usd: 0 };
}

const zeros = (): Record<Api, number> => ({ recall: 0, assembly_gravacao: 0, assembly_ao_vivo: 0, gemini: 0 });

/** Medidas do período, já levadas para 30 dias, que alimentam a projeção. */
export interface Base {
  dias: number;
  usuarios: number;
  usuariosAtivos: number;
  reunioes: number;
  minutos: number;
  reunioesPorUsuarioMes: number;
  minutosPorReuniao: number;
  pctRobo: number;
  pctAoVivo: number;
  /** Minutos cobrados ao vivo por minuto de reunião com coach (≈ 2 trilhas). */
  trilhasAoVivo: number;
  /** Minutos transcritos depois por minuto de reunião sem coach ao vivo. */
  gravacaoPorMinuto: number;
  /** US$ de IA por minuto de reunião (análise e coach). */
  iaPorMinuto: number;
  /** US$ por usuário ativo por mês fora das reuniões (assistente, treinos, dica do dia…). */
  porUsuarioMes: Record<Api, number>;
  /** O período não tinha dados suficientes e a base usa estimativas. */
  estimada: boolean;
}

export interface Resumo {
  dias: number;
  porApi: Record<Api, number>;
  usoPorApi: Record<Api, number>;
  totalUsd: number;
  outrosChamadas: number;
  porEmpresa: (EmpresaUso & { usd: number; porApi: Record<Api, number> })[];
  base: Base;
}

const ESTIMATIVAS = {
  reunioesPorUsuarioMes: 20,
  minutosPorReuniao: 40,
  pctRobo: 0.5,
  pctAoVivo: 0.5,
  trilhasAoVivo: 2,
  gravacaoPorMinuto: 1,
  iaPorMinuto: 0.004,
};

export function resumir(uso: Uso, p: Precos, dias: number): Resumo {
  const porApi = zeros();
  const usoPorApi = zeros();
  const porOrg = new Map<string, Record<Api, number>>();
  let outrosChamadas = 0;
  let iaReuniao = 0;
  let gravacaoReuniao = 0;
  const foraReuniao = zeros();

  for (const l of uso.uso ?? []) {
    const { api, usd } = custoDaLinha(l, p);
    if (!api) { outrosChamadas += num(l.chamadas); continue; }
    porApi[api] += usd;
    usoPorApi[api] += api === "gemini" ? num(l.tokens_entrada) + num(l.tokens_saida) : num(l.quantidade);
    if (l.org_id) {
      const o = porOrg.get(l.org_id) ?? zeros();
      o[api] += usd;
      porOrg.set(l.org_id, o);
    }
    if (api === "gemini" && IA_DA_REUNIAO.has(l.operacao)) iaReuniao += usd;
    else if (api === "assembly_gravacao" && l.operacao === "transcricao" && l.modelo === "universal-2") gravacaoReuniao += num(l.quantidade);
    else if (api !== "assembly_ao_vivo") foraReuniao[api] += usd;
  }

  const empresas = uso.empresas ?? [];
  const soma = (k: keyof EmpresaUso) => empresas.reduce((s, e) => s + num(e[k]), 0);
  const minutos = soma("minutos");
  const minutosRobo = soma("minutos_robo");
  const minutosAoVivo = soma("minutos_ao_vivo");
  const reunioes = soma("reunioes");
  const usuariosAtivos = soma("usuarios_ativos");

  // Recall: cobra a hora gravada pelo robô, que vem da duração das reuniões.
  porApi.recall = (minutosRobo / 60) * p.recall_hora;
  usoPorApi.recall = minutosRobo;
  for (const e of empresas) {
    const o = porOrg.get(e.org_id) ?? zeros();
    o.recall = (num(e.minutos_robo) / 60) * p.recall_hora;
    porOrg.set(e.org_id, o);
  }

  const mes = 30 / Math.max(dias, 1);
  const temDados = reunioes > 0 && minutos > 0 && usuariosAtivos > 0;
  const liveMin = usoPorApi.assembly_ao_vivo;
  const base: Base = {
    dias,
    usuarios: soma("usuarios"),
    usuariosAtivos,
    reunioes,
    minutos,
    reunioesPorUsuarioMes: temDados ? (reunioes / usuariosAtivos) * mes : ESTIMATIVAS.reunioesPorUsuarioMes,
    minutosPorReuniao: temDados ? minutos / reunioes : ESTIMATIVAS.minutosPorReuniao,
    pctRobo: temDados ? soma("reunioes_robo") / reunioes : ESTIMATIVAS.pctRobo,
    pctAoVivo: temDados ? soma("reunioes_ao_vivo") / reunioes : ESTIMATIVAS.pctAoVivo,
    trilhasAoVivo: minutosAoVivo > 0 && liveMin > 0 ? liveMin / minutosAoVivo : ESTIMATIVAS.trilhasAoVivo,
    gravacaoPorMinuto: minutos - minutosAoVivo > 0 && gravacaoReuniao > 0
      ? gravacaoReuniao / (minutos - minutosAoVivo) : ESTIMATIVAS.gravacaoPorMinuto,
    iaPorMinuto: temDados && iaReuniao > 0 ? iaReuniao / minutos : ESTIMATIVAS.iaPorMinuto,
    porUsuarioMes: (Object.keys(foraReuniao) as Api[]).reduce((acc, k) => {
      acc[k] = usuariosAtivos > 0 ? (foraReuniao[k] / usuariosAtivos) * mes : 0;
      return acc;
    }, zeros()),
    estimada: !temDados,
  };

  const totalUsd = Object.values(porApi).reduce((s, v) => s + v, 0);
  const porEmpresa = empresas
    .map((e) => {
      const o = porOrg.get(e.org_id) ?? zeros();
      return { ...e, porApi: o, usd: Object.values(o).reduce((s, v) => s + v, 0) };
    })
    .sort((a, b) => b.usd - a.usd);

  return { dias, porApi, usoPorApi, totalUsd, outrosChamadas, porEmpresa, base };
}

export interface Premissas {
  usuarios: number;
  reunioesPorUsuarioMes: number;
  minutosPorReuniao: number;
  /** 0 a 1 */
  pctRobo: number;
  /** 0 a 1 */
  pctAoVivo: number;
}

export function premissasAtuais(b: Base): Premissas {
  return {
    usuarios: Math.max(b.usuariosAtivos, 1),
    reunioesPorUsuarioMes: Math.round(b.reunioesPorUsuarioMes * 10) / 10,
    minutosPorReuniao: Math.round(b.minutosPorReuniao),
    pctRobo: Math.round(b.pctRobo * 100) / 100,
    pctAoVivo: Math.round(b.pctAoVivo * 100) / 100,
  };
}

export interface Projecao {
  porApi: Record<Api, number>;
  totalUsd: number;
  porUsuarioUsd: number;
  minutosMes: number;
}

/** Custo mensal (US$) com as premissas. */
export function projetar(pr: Premissas, b: Base, p: Precos): Projecao {
  const u = Math.max(0, num(pr.usuarios));
  const robo = Math.min(Math.max(num(pr.pctRobo), 0), 1);
  const aoVivo = Math.min(Math.max(num(pr.pctAoVivo), 0), 1);
  const minutosMes = u * Math.max(0, num(pr.reunioesPorUsuarioMes)) * Math.max(0, num(pr.minutosPorReuniao));
  const porApi: Record<Api, number> = {
    recall: minutosMes * robo * (p.recall_hora / 60),
    assembly_gravacao:
      minutosMes * (1 - aoVivo) * b.gravacaoPorMinuto * (p.assembly_gravacao_hora / 60) + u * b.porUsuarioMes.assembly_gravacao,
    assembly_ao_vivo: minutosMes * aoVivo * b.trilhasAoVivo * (p.assembly_ao_vivo_hora / 60),
    gemini: minutosMes * b.iaPorMinuto + u * b.porUsuarioMes.gemini,
  };
  const totalUsd = Object.values(porApi).reduce((s, v) => s + v, 0);
  return { porApi, totalUsd, porUsuarioUsd: u > 0 ? totalUsd / u : 0, minutosMes };
}
