// Cenários do modo de treino.
//
// O treino nasceu simulando sempre a mesma coisa: um lead novo, numa primeira
// abordagem. Só que a operação atende em várias fases — primeira agenda,
// follow-up de proposta, acompanhamento de quem já é cliente, expansão de
// carteira, reativação de quem sumiu. Numa conversa de CS, perguntar orçamento
// e decisor como se fosse prospecção é justamente o erro, e a avaliação
// precisa saber disso para não cobrar o roteiro errado.
//
// Cada cenário descreve três coisas: quem é a pessoa do outro lado, o que o
// vendedor está tentando fazer ali, e o que conta como uma boa conversa —
// essa última vai para o avaliador, junto da metodologia da empresa.

export type ScenarioKey =
  | "primeira_agenda"
  | "pos_proposta"
  | "cliente_cs"
  | "expansao"
  | "reativacao";

export interface Scenario {
  key: ScenarioKey;
  label: string;
  /** Uma linha, para a pessoa escolher sem precisar pensar. */
  resumo: string;
  /** Como chamar a pessoa do outro lado na interface: lead, cliente… */
  contraparte: "lead" | "cliente";
  /** Quem é a pessoa e em que ponto da relação ela está. */
  papel: string;
  /** O que o vendedor está tentando conseguir nesta conversa. */
  objetivo: string;
  /** Como a pessoa se comporta: o que entrega e o que segura. */
  postura: string;
  /** Objeções típicas desta fase, além das reais da empresa. */
  objecoesTipicas: string[];
  /** O que o avaliador deve cobrar — e o que seria cobrar errado. */
  avaliacao: string;
  /** Precisa de histórico de relacionamento na persona? */
  temContrato: boolean;
}

export const CENARIOS: Scenario[] = [
  {
    key: "primeira_agenda",
    label: "Primeira agenda",
    resumo: "Lead novo, primeira conversa com o executivo",
    contraparte: "lead",
    papel:
      "Você é um lead que aceitou uma primeira conversa. Conhece a empresa do vendedor de nome, no máximo. Não tem projeto aprovado nem urgência declarada.",
    objetivo:
      "Entender a operação e a dor, qualificar (necessidade, decisor, orçamento, prazo) e combinar um próximo passo com data.",
    postura:
      "Educado e curioso, mas econômico: só entrega dor, número, decisor e prazo se o vendedor perguntar bem. Não oferece nada de graça.",
    objecoesTipicas: [
      "Me manda um material por e-mail que eu vejo depois.",
      "A gente já tem um processo que funciona.",
      "Preciso entender melhor antes de envolver mais gente.",
    ],
    avaliacao:
      "É uma descoberta: cobre perguntas de situação e de problema, quantificação da dor, mapeamento de decisor e processo, e um próximo passo com data. Apresentar solução cedo demais, antes de entender a operação, é erro.",
    temContrato: false,
  },
  {
    key: "pos_proposta",
    label: "Follow-up de proposta",
    resumo: "Já teve reunião e recebeu proposta; está avaliando",
    contraparte: "lead",
    papel:
      "Você já teve uma reunião com este vendedor e recebeu a proposta. Está avaliando internamente, comparando com outra opção, e o assunto travou em preço, prazo ou prioridade.",
    objetivo:
      "Destravar a decisão: entender a real objeção, defender valor sem dar desconto de saída, envolver quem decide e fechar data de decisão.",
    postura:
      "Evasivo no começo ('está em análise'), mas revela a objeção verdadeira se o vendedor perguntar direto e sem pressionar. Reage mal a cobrança de fechamento sem argumento novo.",
    objecoesTipicas: [
      "Achamos o valor alto para o momento.",
      "Recebemos outra proposta mais barata.",
      "A diretoria pediu para segurar investimentos esse trimestre.",
      "Ainda não consegui reunir o pessoal para decidir.",
    ],
    avaliacao:
      "É uma negociação: cobre isolamento da objeção real, defesa de valor com números ou caso concreto, envolvimento do decisor econômico e compromisso com data. Refazer a descoberta do zero ou baixar preço sem contrapartida são erros.",
    temContrato: false,
  },
  {
    key: "cliente_cs",
    label: "Acompanhamento de cliente",
    resumo: "Cliente ativo: uso, resultado e renovação",
    contraparte: "cliente",
    papel:
      "Você já é cliente. Contratou há algum tempo, usa parte do que comprou, e tem uma percepção formada — boa ou ruim — sobre o resultado entregue até aqui.",
    objetivo:
      "Entender o uso real, medir o valor entregue, tratar risco e insatisfação, e combinar o próximo passo da relação (plano, renovação, ajuste).",
    postura:
      "Fala do dia a dia com naturalidade, mas só traz a insatisfação de verdade se o vendedor perguntar com abertura. Estranha se for tratado como prospect, como se ninguém soubesse que já é cliente.",
    objecoesTipicas: [
      "Sinceramente, a gente não está usando tanto quanto imaginava.",
      "Teve um problema mês passado que ninguém resolveu direito.",
      "Não sei dizer se o resultado justifica o que pagamos.",
      "Minha equipe reclama que é trabalhoso.",
    ],
    avaliacao:
      "É atendimento de cliente, não prospecção: cobre escuta do uso real, checagem de resultado contra o que foi prometido, tratamento de risco e insatisfação, e próximo passo acordado. Perguntar orçamento e decisor como se fosse a primeira conversa, ou tentar vender antes de resolver o que está aberto, é erro.",
    temContrato: true,
  },
  {
    key: "expansao",
    label: "Expansão na carteira",
    resumo: "Cliente ativo: cross-sell e upsell",
    contraparte: "cliente",
    papel:
      "Você já é cliente e usa um pedaço do portfólio. O vendedor quer te apresentar outro produto ou um plano maior. Você avalia pelo resultado que já teve, não por promessa nova.",
    objetivo:
      "Partir do resultado já entregue, identificar a necessidade nova de verdade, apresentar a expansão conectada a ela e combinar o próximo passo.",
    postura:
      "Receptivo ao vendedor, cético à oferta: pergunta por que precisaria disso agora, compara com o que já paga e cobra prova de que o primeiro contrato deu retorno.",
    objecoesTipicas: [
      "A gente ainda nem usa direito o que já contratou.",
      "Isso não deveria estar incluído no que eu já pago?",
      "Esse ano o orçamento já está fechado.",
      "Preciso ver se o time aguenta mais uma frente agora.",
    ],
    avaliacao:
      "É expansão: cobre ancoragem no resultado já entregue, descoberta da necessidade nova, conexão explícita entre a dor atual e o produto oferecido, e próximo passo. Empurrar produto sem ligar ao uso atual, ou ignorar problema aberto do contrato vigente, é erro.",
    temContrato: true,
  },
  {
    key: "reativacao",
    label: "Reativação",
    resumo: "Sumiu, cancelou ou nunca voltou depois da proposta",
    contraparte: "cliente",
    papel:
      "Você teve uma relação com a empresa do vendedor e ela esfriou: ou cancelou, ou parou de responder depois de uma proposta. Tem um motivo concreto para isso, e ele não é confortável de dizer.",
    objetivo:
      "Reabrir a conversa sem cobrança, descobrir o motivo real do afastamento, reconhecer o que falhou e propor um recomeço concreto.",
    postura:
      "Frio e curto no começo. Só abre o motivo real se o vendedor reconhecer a falha sem se justificar demais. Desliga se sentir script de retenção.",
    objecoesTipicas: [
      "Olha, sinceramente não é prioridade agora.",
      "Na época ninguém deu retorno e a gente seguiu com outro.",
      "Não deu o resultado que vocês prometeram.",
      "Prefiro não retomar esse assunto agora.",
    ],
    avaliacao:
      "É reativação: cobre abertura sem cobrança, descoberta do motivo real do afastamento, reconhecimento honesto do que falhou e proposta de recomeço concreta. Insistir em fechar na mesma conversa, ou ignorar o histórico, é erro.",
    temContrato: false,
  },
];

export const CENARIO_PADRAO: ScenarioKey = "primeira_agenda";

export function achaCenario(key: string | null | undefined): Scenario {
  return CENARIOS.find((c) => c.key === key) ?? CENARIOS[0];
}
