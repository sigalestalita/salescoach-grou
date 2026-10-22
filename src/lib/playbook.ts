/**
 * Playbooks de atendimento: modelos prontos para times que não vendem
 * (Customer Success, suporte, onboarding, renovação). Cada playbook vira um
 * analysis_templates com mode = 'playbook': as etapas ficam em
 * qualification_criteria, as faixas de saúde em temperature_levels e o resto
 * (objetivo, boas práticas, o que evitar, sinais, informações a registrar)
 * em playbook. O backend monta o prompt em
 * supabase/functions/_shared/analysis-template.ts (buildPlaybookPrompt).
 */

export type SignalType = "risco" | "oportunidade" | "atencao";

export interface PlaybookStep {
  key: string;
  label: string;
  description?: string;
  max_score?: number;
  required?: boolean;
}

export interface PlaybookSignal {
  key: string;
  label: string;
  description?: string;
  tipo: SignalType;
}

export interface PlaybookField {
  key: string;
  label: string;
  description?: string;
}

export interface PlaybookBody {
  objetivo?: string;
  boas_praticas?: string[];
  evitar?: string[];
  sinais?: PlaybookSignal[];
  campos?: PlaybookField[];
  /** O time também vende nesta conversa (upsell, cross-sell): usa os materiais de Vendas da base. */
  expansao_comercial?: boolean;
}

export interface PlaybookPreset {
  id: string;
  label: string;
  summary: string;
  steps: PlaybookStep[];
  body: PlaybookBody;
}

export const PLAYBOOK_PERSONA = "Você é um especialista em Customer Success B2B.";

export const SIGNAL_LABELS: Record<SignalType, string> = {
  risco: "Risco",
  oportunidade: "Oportunidade",
  atencao: "Atenção",
};

/** Faixas de saúde do cliente, da pior para a melhor. */
export const HEALTH_LEVELS = [
  { key: "critico", label: "Crítico", criteria: "Cliente fala em cancelar, trocar de fornecedor ou está muito insatisfeito." },
  { key: "em_risco", label: "Em risco", criteria: "Insatisfação clara, baixo uso ou problema sem solução combinada." },
  { key: "atencao", label: "Atenção", criteria: "Dúvidas ou atritos pontuais; precisa de acompanhamento próximo." },
  { key: "saudavel", label: "Saudável", criteria: "Cliente satisfeito, usando e com próximos passos claros." },
  { key: "promotor", label: "Promotor", criteria: "Cliente elogia, vê valor claro e abre espaço para expansão ou indicação." },
];

/** Sinais que valem para quase todo atendimento. */
const SINAIS_BASE: PlaybookSignal[] = [
  { key: "cancelamento", label: "Fala em cancelar ou não renovar", tipo: "risco", description: "Menciona cancelamento, rever contrato, cortar custos ou avaliar outro fornecedor" },
  { key: "insatisfacao", label: "Insatisfação", tipo: "risco", description: "Reclama do produto, do atendimento ou de um prazo" },
  { key: "baixo_uso", label: "Baixo uso", tipo: "risco", description: "Time do cliente não usa, ou usa pouco, o que foi contratado" },
  { key: "troca_responsavel", label: "Troca de responsável", tipo: "atencao", description: "Quem patrocina o projeto no cliente saiu ou vai mudar" },
  { key: "expansao", label: "Oportunidade de expansão", tipo: "oportunidade", description: "Quer mais usuários, outra área ou outro produto" },
  { key: "indicacao", label: "Abertura para indicação ou case", tipo: "oportunidade", description: "Elogia e topa indicar, dar depoimento ou virar case" },
];

const CAMPOS_BASE: PlaybookField[] = [
  { key: "responsavel_cliente", label: "Responsável no cliente", description: "Nome e cargo de quem conduz o projeto do lado do cliente" },
  { key: "proxima_data", label: "Próxima data combinada", description: "Data da próxima conversa ou entrega" },
];

export const PLAYBOOK_PRESETS: PlaybookPreset[] = [
  {
    id: "onboarding",
    label: "Onboarding",
    summary: "Reunião de início: expectativas, objetivos, responsáveis e plano de implantação com datas.",
    steps: [
      { key: "expectativas", label: "Alinhamento de expectativas", description: "Apresenta o processo de onboarding e o que o cliente pode esperar", max_score: 10, required: true },
      { key: "objetivos", label: "Objetivos e critérios de sucesso", description: "Entende o que o cliente quer alcançar e como vai medir", max_score: 20, required: true },
      { key: "responsaveis", label: "Mapa de responsáveis", description: "Identifica quem decide, quem executa e quem usa do lado do cliente", max_score: 15 },
      { key: "plano", label: "Plano com marcos e datas", description: "Combina as etapas da implantação com datas", max_score: 20, required: true },
      { key: "riscos", label: "Riscos e dependências", description: "Levanta o que pode atrasar (dados, acessos, agenda do time)", max_score: 15 },
      { key: "proximos_passos", label: "Próximos passos com dono e prazo", description: "Fecha a conversa com tarefas, responsáveis e datas", max_score: 15, required: true },
      { key: "rotina", label: "Rotina de acompanhamento", description: "Combina canal e frequência dos próximos contatos", max_score: 5 },
    ],
    body: {
      objetivo: "Sair com objetivos claros, responsáveis definidos e um plano de implantação com datas aceito pelo cliente.",
      boas_praticas: ["Confirmar o entendimento com as palavras do cliente", "Registrar metas em números quando possível", "Enviar o resumo e o plano por escrito depois"],
      evitar: ["Prometer prazo ou funcionalidade que não existe", "Terminar sem data para o próximo passo"],
      sinais: SINAIS_BASE,
      campos: [...CAMPOS_BASE, { key: "meta_cliente", label: "Meta do cliente", description: "O resultado que o cliente quer alcançar" }, { key: "data_go_live", label: "Data de go-live", description: "Quando o cliente começa a usar de verdade" }],
    },
  },
  {
    id: "checkin",
    label: "Check-in de acompanhamento",
    summary: "Conversa periódica: retoma combinados, uso, bloqueios e satisfação, e fecha um plano.",
    steps: [
      { key: "combinados", label: "Retoma os combinados anteriores", description: "Confere o que ficou da última conversa", max_score: 15 },
      { key: "uso_resultados", label: "Uso e resultados", description: "Pergunta como o cliente está usando e o que já mudou", max_score: 25, required: true },
      { key: "bloqueios", label: "Dificuldades e bloqueios", description: "Investiga o que atrapalha o uso ou o resultado", max_score: 20, required: true },
      { key: "satisfacao", label: "Satisfação", description: "Pergunta diretamente como o cliente avalia a parceria", max_score: 15 },
      { key: "plano_acao", label: "Plano de ação", description: "Combina o que será feito para resolver os bloqueios", max_score: 15 },
      { key: "proximos_passos", label: "Próximos passos com dono e prazo", description: "Fecha com tarefas, responsáveis e datas", max_score: 10, required: true },
    ],
    body: {
      objetivo: "Saber como o cliente está de verdade, destravar o que impede o resultado e sair com um plano.",
      boas_praticas: ["Fazer perguntas abertas e ouvir mais do que falar", "Usar dados de uso quando houver", "Registrar o que o cliente pediu"],
      evitar: ["Transformar a conversa em apresentação de novidades", "Ignorar uma reclamação para seguir a pauta"],
      sinais: SINAIS_BASE,
      campos: [...CAMPOS_BASE, { key: "nota_satisfacao", label: "Nota de satisfação", description: "Nota ou avaliação que o cliente der" }],
    },
  },
  {
    id: "revisao_resultados",
    label: "Revisão de resultados (QBR)",
    summary: "Revisão do período: resultados contra metas, valor gerado, prioridades e oportunidades.",
    steps: [
      { key: "agenda", label: "Agenda e objetivo da reunião", description: "Abre com a pauta e o que se espera da conversa", max_score: 10 },
      { key: "resultados_metas", label: "Resultados contra metas", description: "Mostra os resultados do período comparados às metas, com números", max_score: 25, required: true },
      { key: "valor", label: "Valor gerado", description: "Traduz os resultados em ganho para o negócio do cliente", max_score: 20, required: true },
      { key: "desafios", label: "Desafios do período", description: "Discute o que não funcionou e por quê", max_score: 15 },
      { key: "prioridades", label: "Prioridades do próximo período", description: "Combina metas e prioridades para o próximo ciclo", max_score: 15, required: true },
      { key: "expansao", label: "Oportunidades de expansão", description: "Explora novas áreas ou usos, só se o cliente der abertura", max_score: 5 },
      { key: "compromissos", label: "Compromissos com dono e prazo", description: "Fecha com responsáveis e datas", max_score: 10 },
    ],
    body: {
      objetivo: "Mostrar o valor entregue com números e combinar as prioridades do próximo período com quem decide.",
      boas_praticas: ["Levar números preparados", "Envolver quem decide no cliente", "Ligar cada resultado a uma meta do cliente"],
      evitar: ["Apresentar só atividades, sem resultado", "Forçar venda adicional sem abertura do cliente"],
      sinais: SINAIS_BASE,
      campos: [...CAMPOS_BASE, { key: "resultado_principal", label: "Resultado principal do período", description: "O número ou ganho mais importante apresentado" }],
    },
  },
  {
    id: "renovacao",
    label: "Renovação",
    summary: "Conversa de renovação: valor entregue, mudanças no cliente, riscos, condições e decisão.",
    steps: [
      { key: "valor_entregue", label: "Recapitula o valor entregue", description: "Relembra os resultados alcançados no contrato", max_score: 20, required: true },
      { key: "mudancas", label: "Mudanças no cliente", description: "Pergunta sobre mudanças de time, prioridades e orçamento", max_score: 15 },
      { key: "riscos", label: "Riscos de não renovar", description: "Investiga objeções, alternativas e o que pode impedir a renovação", max_score: 20, required: true },
      { key: "condicoes", label: "Condições da renovação", description: "Apresenta proposta, prazo e condições com clareza", max_score: 15 },
      { key: "decisao", label: "Decisores e prazo de decisão", description: "Confirma quem decide e até quando", max_score: 15, required: true },
      { key: "proximos_passos", label: "Próximos passos com dono e prazo", description: "Fecha com tarefas, responsáveis e datas", max_score: 15 },
    ],
    body: {
      objetivo: "Garantir a renovação mostrando o valor entregue e tratando os riscos antes do prazo de decisão.",
      boas_praticas: ["Começar pelo valor, não pelo preço", "Tratar objeções com perguntas", "Confirmar o processo de aprovação do cliente"],
      evitar: ["Dar desconto antes de entender a objeção", "Sair sem data de decisão"],
      sinais: SINAIS_BASE,
      campos: [...CAMPOS_BASE, { key: "data_decisao", label: "Data de decisão da renovação" }, { key: "objecao_principal", label: "Principal objeção" }],
      expansao_comercial: true,
    },
  },
  {
    id: "expansao",
    label: "Expansão de conta (upsell e cross-sell)",
    summary: "CS que vende para a carteira: resultado atual, nova necessidade, oferta ligada a ela, condições e decisão.",
    steps: [
      { key: "saude_atual", label: "Situação atual do cliente", description: "Confere uso, resultados e se há algum problema em aberto antes de falar em oferta", max_score: 15, required: true },
      { key: "necessidade", label: "Nova necessidade ou objetivo", description: "Descobre, com perguntas, uma dor, meta ou área que o contratado hoje não cobre", max_score: 20, required: true },
      { key: "conexao", label: "Oferta ligada à necessidade", description: "Apresenta o produto, plano ou serviço adicional a partir do que o cliente disse", max_score: 20, required: true },
      { key: "valor", label: "Valor e retorno esperado", description: "Mostra o ganho para o cliente, com números ou casos parecidos", max_score: 15 },
      { key: "objecoes", label: "Objeções tratadas", description: "Entende e responde dúvidas de preço, prazo, momento e prioridade", max_score: 10 },
      { key: "decisao", label: "Decisores e prazo de decisão", description: "Confirma quem aprova a compra e até quando", max_score: 10 },
      { key: "proximos_passos", label: "Próximos passos com dono e prazo", description: "Fecha com proposta, reunião ou teste combinado e datas", max_score: 10, required: true },
    ],
    body: {
      objetivo: "Ampliar a conta a partir de uma necessidade real do cliente, sem comprometer a relação nem a saúde da carteira.",
      boas_praticas: ["Começar pelos resultados que o cliente já tem", "Ligar a oferta a algo que o cliente disse", "Usar preços e condições oficiais", "Envolver quem decide no cliente"],
      evitar: ["Oferecer com o cliente insatisfeito ou com problema em aberto", "Empurrar produto sem necessidade levantada", "Inventar preço, desconto ou funcionalidade"],
      sinais: [
        ...SINAIS_BASE,
        { key: "orcamento", label: "Orçamento disponível ou previsto", tipo: "oportunidade", description: "Fala em verba aprovada, novo ciclo de orçamento ou investimento planejado" },
        { key: "concorrente", label: "Usa ou avalia concorrente para a nova necessidade", tipo: "atencao", description: "Cita outro fornecedor para o que a oferta resolveria" },
      ],
      campos: [...CAMPOS_BASE, { key: "produto_oferecido", label: "Produto ou plano oferecido" }, { key: "valor_estimado", label: "Valor estimado da expansão" }, { key: "data_decisao", label: "Data de decisão" }],
      expansao_comercial: true,
    },
  },
  {
    id: "suporte",
    label: "Atendimento de suporte",
    summary: "Atendimento de um problema: entendimento, impacto, diagnóstico, solução ou prazo e confirmação.",
    steps: [
      { key: "acolhimento", label: "Acolhimento e entendimento do problema", description: "Deixa o cliente explicar e repete o problema com as palavras dele", max_score: 20, required: true },
      { key: "impacto", label: "Impacto e urgência", description: "Entende o quanto o problema atrapalha e o que está parado", max_score: 15 },
      { key: "diagnostico", label: "Diagnóstico", description: "Faz as perguntas certas para chegar à causa", max_score: 20 },
      { key: "solucao", label: "Solução ou encaminhamento com prazo", description: "Resolve, ou explica o próximo passo e quando o cliente terá retorno", max_score: 25, required: true },
      { key: "confirmacao", label: "Confirmação com o cliente", description: "Confirma que o cliente entendeu e está de acordo", max_score: 10 },
      { key: "registro", label: "Registro e retorno combinado", description: "Combina como e quando volta a falar com o cliente", max_score: 10 },
    ],
    body: {
      objetivo: "Resolver o problema ou deixar claro o próximo passo e o prazo, com o cliente seguro de que está sendo cuidado.",
      boas_praticas: ["Ter empatia antes de partir para a solução", "Explicar em linguagem simples", "Dar prazo realista"],
      evitar: ["Culpar o cliente", "Prometer prazo que não depende de você", "Encerrar sem confirmar o entendimento"],
      sinais: SINAIS_BASE.filter((s) => s.key !== "indicacao"),
      campos: [{ key: "problema", label: "Problema relatado" }, { key: "prazo_retorno", label: "Prazo de retorno combinado" }],
    },
  },
  {
    id: "recuperacao",
    label: "Recuperação de cliente em risco",
    summary: "Conversa com cliente insatisfeito: escuta, causa raiz, plano de recuperação e acompanhamento.",
    steps: [
      { key: "escuta", label: "Escuta sem defensiva", description: "Deixa o cliente falar tudo sem interromper ou justificar", max_score: 20, required: true },
      { key: "causa_raiz", label: "Causa raiz", description: "Investiga o que realmente gerou a insatisfação", max_score: 20 },
      { key: "responsabilidade", label: "Reconhece a responsabilidade", description: "Assume o que é da empresa, sem desculpas genéricas", max_score: 15 },
      { key: "plano", label: "Plano de recuperação com prazos", description: "Propõe ações concretas com datas", max_score: 25, required: true },
      { key: "acompanhamento", label: "Responsável e acompanhamento", description: "Define quem acompanha e a frequência dos contatos", max_score: 10 },
      { key: "confianca", label: "Confirma o próximo passo com o cliente", description: "Checa se o plano faz sentido para o cliente", max_score: 10 },
    ],
    body: {
      objetivo: "Recuperar a confiança do cliente com um plano concreto, evitando o cancelamento.",
      boas_praticas: ["Validar o sentimento do cliente", "Comprometer-se só com o que dá para cumprir", "Mandar o plano por escrito"],
      evitar: ["Discutir com o cliente", "Minimizar o problema", "Oferecer desconto como primeira resposta"],
      sinais: SINAIS_BASE,
      campos: [...CAMPOS_BASE, { key: "motivo_insatisfacao", label: "Motivo da insatisfação" }],
    },
  },
];
