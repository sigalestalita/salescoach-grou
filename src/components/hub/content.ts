import {
  BarChart3, BookOpen, Bot, CalendarCheck, CalendarDays, ClipboardList, Dumbbell, FileSearch, MonitorSmartphone, Plug, Settings,
  Sparkles, Users,
} from "lucide-react";

/**
 * Conteúdo da central: etapas da jornada, artigos de ajuda, perguntas
 * frequentes e tours. Os tours apontam para elementos marcados com
 * `data-tour="..."` nas telas; se a marca sumir de uma tela, a etapa vira um
 * balão centralizado, sem quebrar.
 */

export interface TourStep {
  /** Valor de data-tour do elemento destacado. Sem ele, balão no centro. */
  target?: string;
  /** Tela a abrir antes da etapa. */
  route?: string;
  title: string;
  body: string;
}

export interface JourneyDef {
  id: string;
  title: string;
  description: string;
  cta: string;
  route: string;
  /** Tour a mostrar ao abrir a tela pela jornada. */
  tour?: string;
  roles: string[];
  minutes: number;
  /** Concluída pelos dados (ver useOnboarding); senão, a pessoa marca. */
  auto: boolean;
}

export interface HelpArticle {
  id: string;
  title: string;
  icon: typeof BookOpen;
  summary: string;
  route?: string;
  tour?: string;
  roles?: string[];
  sections: { title: string; items: string[] }[];
}

const ALL = ["admin", "gestor", "vendedor"];
const MGMT = ["admin", "gestor"];

// ── Jornada ─────────────────────────────────────────────────────────────────

export const JOURNEY: JourneyDef[] = [
  {
    id: "metodologia",
    title: "Configure a metodologia, os tipos de reunião e a marca",
    description:
      "Em Configurações, ajuste os tipos de reunião (com instruções para a análise de cada um), a metodologia (critérios de qualificação, faixas de temperatura e regras da operação) e a identidade visual: logo, cores e e-mail de suporte. É o que faz a análise falar a língua da sua empresa. Tem time de CS, suporte ou onboarding? Crie também os playbooks de atendimento (veja a ajuda \"Coach de atendimento\").",
    cta: "Abrir Configurações",
    route: "/configuracoes",
    tour: "configuracoes",
    roles: ["admin"],
    minutes: 10,
    auto: false,
  },
  {
    id: "conhecimento",
    title: "Alimente a base de conhecimento",
    description:
      "Envie apresentações, propostas, cases e tabelas de produtos (PDF, Word, planilha, link ou texto) e clique em Treinar IA. A análise passa a comparar cada reunião com o que vocês vendem.",
    cta: "Abrir a base",
    route: "/conhecimento",
    tour: "conhecimento",
    roles: ["admin"],
    minutes: 10,
    auto: true,
  },
  {
    id: "equipe",
    title: "Traga o seu time",
    description:
      "Em Equipe, clique em Adicionar pessoa: gere um convite por link (a pessoa cria a própria senha) ou crie o acesso com uma senha inicial. Escolha o papel (Admin, Gestor ou Executivo) e, se quiser, a equipe.",
    cta: "Abrir Equipe",
    route: "/equipe",
    tour: "equipe",
    roles: ["admin"],
    minutes: 5,
    auto: true,
  },
  {
    id: "crm",
    title: "Conecte o CRM",
    description:
      "RD Station CRM, HubSpot, Pipedrive ou Kommo. Ao fim de cada análise, o Sales Coach registra uma anotação com o resumo e cria a tarefa do próximo passo no negócio.",
    cta: "Conectar o CRM",
    route: "/configuracoes",
    tour: "configuracoes",
    roles: ["admin"],
    minutes: 5,
    auto: true,
  },
  {
    id: "extensao",
    title: "Instale a extensão do Chrome",
    description:
      "Pela Chrome Web Store, em um clique. Com o Sales Coach aberto neste navegador, ela entra na sua conta sozinha e oferece a gravação quando você entra numa reunião do Meet ou do Teams.",
    cta: "Instalar a extensão",
    route: "/extensao",
    tour: "extensao",
    roles: ALL,
    minutes: 2,
    auto: true,
  },
  {
    id: "agenda",
    title: "Conecte a sua agenda",
    description:
      "Google Agenda ou Outlook, só leitura. As gravações já chegam com o título da reunião, os participantes e o lead (nome e e-mail).",
    cta: "Conectar a agenda",
    route: "/agendas",
    tour: "agendas",
    roles: ALL,
    minutes: 1,
    auto: true,
  },
  {
    id: "primeira-reuniao",
    title: "Grave a sua primeira reunião",
    description:
      "Entre numa chamada do Meet ou do Teams e clique em Gravar no cartão do Sales Coach. Admins e gestores também podem enviar um arquivo ou um link do Drive ou do YouTube em Agendas → Nova Agenda.",
    cta: "Abrir Agendas",
    route: "/agendas",
    tour: "agendas",
    roles: ALL,
    minutes: 5,
    auto: true,
  },
  {
    id: "analise",
    title: "Leia uma análise completa",
    description:
      "Abra uma reunião com status Completo: score geral, temperatura, critérios da metodologia, o que foi bem, o que faltou, próximos passos e os momentos-chave da conversa.",
    cta: "Ver minhas reuniões",
    route: "/agendas",
    roles: ALL,
    minutes: 5,
    auto: true,
  },
  {
    id: "visao-geral",
    title: "Acompanhe o time na Visão geral",
    description:
      "Evolução dos scores, temperatura das agendas, médias da metodologia, talk ratio e ranking de vendedores. Use o filtro para ver uma pessoa só.",
    cta: "Abrir a Visão geral",
    route: "/",
    tour: "visao-geral",
    roles: MGMT,
    minutes: 3,
    auto: false,
  },
  {
    id: "treino",
    title: "Faça um treino com cliente simulado",
    description:
      "No Modo de treino, escolha o tipo de reunião, a dificuldade e o momento da relação, e converse por texto ou por voz com um cliente simulado. No fim, você recebe um score e o que melhorar.",
    cta: "Começar um treino",
    route: "/treino",
    tour: "treino",
    roles: ALL,
    minutes: 10,
    auto: true,
  },
  {
    id: "argumentos",
    title: "Gere argumentos para um lead",
    description:
      "Informe o contexto do lead e as dores do cliente e receba argumentos, simulação de ROI, frases prontas (proposta, WhatsApp, e-mail) e respostas para objeções.",
    cta: "Abrir o gerador",
    route: "/argumentos",
    tour: "argumentos",
    roles: ["gestor", "vendedor"],
    minutes: 5,
    auto: false,
  },
];

// ── Tours ───────────────────────────────────────────────────────────────────

/** Tour de boas-vindas: uma volta pelo menu, conforme o papel. */
export function welcomeTour(role: string | null): TourStep[] {
  const mgmt = role === "admin" || role === "gestor";
  const steps: (TourStep | false)[] = [
    {
      title: "Boas-vindas ao Sales Coach",
      body: "Ele grava e analisa as suas reuniões de venda pela metodologia da sua empresa e mostra o que fazer melhor na próxima. Uma volta rápida pelas telas:",
    },
    { target: "nav-agendas", title: "Agendas", body: "Todas as reuniões gravadas, com status, score e temperatura. Clique numa reunião para ver a análise completa." },
    mgmt && { target: "nav-inicio", title: "Visão geral", body: "Indicadores do time: evolução dos scores, temperatura das agendas, médias da metodologia e ranking de vendedores." },
    mgmt && { target: "nav-conhecimento", title: "Base de conhecimento", body: "Materiais da empresa (apresentações, propostas, cases). A IA usa para avaliar se a conversa bateu com o que vocês vendem." },
    { target: "nav-argumentos", title: "Gerador de argumentos", body: "Argumentos, ROI, frases prontas e respostas para objeções a partir do contexto do lead." },
    { target: "nav-treino", title: "Modo de treino", body: "Converse com um cliente simulado, por texto ou voz, e receba uma avaliação no fim." },
    { target: "nav-extensao", title: "Extensão do Chrome", body: "Grava as reuniões do Meet e do Teams com um clique e mostra dicas ao vivo durante a chamada." },
    { target: "hub", title: "Sua central", body: "Aqui ficam os primeiros passos, a ajuda de cada tela e o assistente de vendas. Clique sempre que tiver dúvida." },
  ];
  return steps.filter(Boolean) as TourStep[];
}

export const TOURS: Record<string, { title: string; steps: TourStep[] }> = {
  agendas: {
    title: "Agendas",
    steps: [
      { route: "/agendas", target: "agendas-titulo", title: "Agendas", body: "Cada reunião gravada ou enviada vira uma agenda: transcrição, análise e score. O vendedor vê as próprias; gestores e admins veem as do time." },
      { route: "/agendas", target: "agenda-conectar", title: "Sua agenda", body: "Conecte o Google Agenda ou o Outlook. As gravações já chegam com o título, os participantes e o lead." },
      { route: "/agendas", target: "nova-agenda", title: "Nova Agenda", body: "Envie um arquivo (MP3, WAV, M4A ou MP4, até 20 MB) ou cole um link do Drive ou do YouTube. Para vários links, use Importar em Lote." },
      { route: "/agendas", target: "agendas-filtros", title: "Busca e filtros", body: "Ache uma agenda pelo nome, pelo tipo de reunião ou pelo executivo." },
      { route: "/agendas", target: "agendas-lista", title: "Lista de agendas", body: "O status mostra em que ponto está: Enviado, Transcrevendo, Analisando, Completo ou Erro. Clique para abrir a análise. No menu ⋮ dá para editar, refazer a análise ou apagar." },
    ],
  },
  reuniao: {
    title: "Análise da reunião",
    steps: [
      { target: "reuniao-titulo", title: "A análise da reunião", body: "Tudo o que a IA tirou da conversa, pela metodologia da sua empresa." },
      { target: "reuniao-compartilhar", title: "Compartilhar", body: "Gere um link para quem não tem conta ver a análise, a transcrição e a gravação. Você escolhe a validade e pode desligar a qualquer momento." },
      { target: "reuniao-crm", title: "CRM", body: "Com o CRM conectado, a análise vai para o negócio certo: anotação com o resumo e tarefa do próximo passo." },
      { target: "reuniao-scores", title: "Score, temperatura e talk ratio", body: "Score geral de 0 a 100, temperatura do lead e quanto cada lado falou. Logo abaixo, a nota de cada critério da metodologia." },
      { target: "reuniao-coach", title: "Insights e Sales Coach", body: "O que foi bem, o que faltou, os próximos passos e sugestões para a próxima conversa." },
      { target: "reuniao-transcricao", title: "Highlights e transcrição", body: "Objeções, sinais de compra e momentos-chave, e a transcrição completa." },
    ],
  },
  "visao-geral": {
    title: "Visão geral",
    steps: [
      { route: "/", target: "dash-filtro", title: "Filtro de vendedor", body: "Veja o time todo ou uma pessoa só." },
      { route: "/", target: "dash-stats", title: "Indicadores", body: "Total de agendas, score médio, reuniões quentes e vendedores ativos." },
      { route: "/", target: "dash-graficos", title: "Gráficos", body: "Evolução dos scores, temperatura das agendas, médias da metodologia, talk ratio e ranking de vendedores." },
    ],
  },
  conhecimento: {
    title: "Base de conhecimento",
    steps: [
      { route: "/conhecimento", target: "kb-abas", title: "Documentos e Produtos & Serviços", body: "Documentos: materiais da empresa. Produtos & Serviços: o catálogo, com descrição e categoria." },
      { route: "/conhecimento", target: "kb-adicionar", title: "Adicionar", body: "Envie PDF, Word, TXT, CSV ou planilha, cole um link (inclusive Google Sheets) ou escreva o texto." },
      { route: "/conhecimento", target: "kb-treinar", title: "Treinar IA", body: "Depois de adicionar, clique em Treinar IA para processar os documentos. A análise das reuniões passa a usar esse conteúdo." },
    ],
  },
  argumentos: {
    title: "Gerador de argumentos",
    steps: [
      { route: "/argumentos", target: "arg-contexto", title: "Contexto do lead", body: "Preencha o contexto, o público-alvo, o tipo de oferta e pelo menos uma dor do cliente." },
      { route: "/argumentos", target: "arg-gerar", title: "Gerar argumentos", body: "Você recebe argumentos, simulação de ROI, frases prontas para proposta, WhatsApp e e-mail, e respostas para objeções, todos com botão de copiar." },
    ],
  },
  treino: {
    title: "Modo de treino",
    steps: [
      { route: "/treino", target: "treino-config", title: "Configure a simulação", body: "Tipo de reunião, dificuldade, foco da dor e momento da relação (primeira agenda, follow-up, expansão...)." },
      { route: "/treino", target: "treino-modo", title: "Texto ou voz", body: "Treine digitando ou numa chamada de voz, com vozes brasileiras." },
      { route: "/treino", target: "treino-comecar", title: "Começar", body: "Converse com o cliente simulado e clique em Encerrar e avaliar: score, temperatura, critérios e o que melhorar." },
    ],
  },
  configuracoes: {
    title: "Configurações",
    steps: [
      { route: "/configuracoes", target: "cfg-marca", title: "Identidade visual", body: "Nome do produto, logo, cores, e-mail de suporte e textos da tela de login." },
      { route: "/configuracoes", target: "cfg-tipos", title: "Tipos de reunião", body: "Diagnóstico, proposta, follow-up... Crie, ordene, desative e escreva instruções para a análise de cada tipo." },
      { route: "/configuracoes", target: "cfg-metodologia", title: "Metodologias de análise", body: "Crie metodologias a partir de modelos prontos (BANT, SPICED, MEDDIC...), escolha a padrão e ligue ou desligue MEDDIC e SPIN. Cada tipo de reunião pode usar uma diferente." },
      { route: "/configuracoes", target: "cfg-playbooks", title: "Playbooks de atendimento", body: "Para times que não vendem (CS, suporte, onboarding): a conversa é avaliada pelo playbook da empresa, com saúde do cliente e sinais de risco. Veja o tour \"Coach de atendimento\" na ajuda." },
      { route: "/configuracoes", target: "cfg-crm", title: "Integração com CRM", body: "Conecte RD Station CRM, HubSpot, Pipedrive ou Kommo e escolha o que enviar ao fim de cada análise." },
    ],
  },
  atendimento: {
    title: "Coach de atendimento",
    steps: [
      { route: "/configuracoes", target: "cfg-playbooks", title: "Playbooks de atendimento", body: "Times de CS, suporte e onboarding não são avaliados por BANT ou SPICED: cada conversa segue um playbook da empresa. A IA mede a aderência ao playbook, a saúde do cliente e os sinais de risco e de oportunidade." },
      { route: "/configuracoes", target: "cfg-playbooks-novo", title: "1. Comece por um modelo", body: "Novo playbook traz modelos prontos: Onboarding, Check-in de acompanhamento, Revisão de resultados (QBR), Renovação, Atendimento de suporte e Recuperação de cliente em risco." },
      { route: "/configuracoes", target: "cfg-playbooks-ia", title: "…ou monte a partir do playbook de vocês", body: "Cole o texto do playbook do time (roteiro, checklist, política de atendimento). A IA estrutura em etapas, sinais e faixas de saúde. Nada é salvo antes da sua revisão." },
      { route: "/configuracoes", target: "cfg-playbooks-etapas", title: "2. Ajuste as etapas", body: "Na ordem em que acontecem, com peso (o ideal é somar 100) e a marca de obrigatória. A aderência ao playbook é a soma dos pontos das etapas." },
      { route: "/configuracoes", target: "cfg-playbooks-sinais", title: "3. Sinais e informações a registrar", body: "Sinais: o que o cliente diz que indica risco (cancelar, insatisfação), oportunidade (expansão, indicação) ou atenção. Informações a registrar: o que a IA anota quando aparece (data de go-live, responsável no cliente) e que pode ir para o CRM." },
      { route: "/configuracoes", target: "cfg-playbooks-salvar", title: "4. Salve", body: "Ao salvar um playbook novo, o tipo de reunião com o mesmo nome já é criado e ligado a ele. O time de CS grava pela extensão escolhendo esse tipo, e a conversa é avaliada pelo playbook." },
      { route: "/configuracoes", target: "cfg-tipos", title: "Tipos de reunião", body: "Para ligar um tipo que já existe a um playbook, abra o tipo e escolha o playbook em \"Metodologia ou playbook de análise\"." },
      { route: "/configuracoes", target: "cfg-crm-atendimento", title: "5. CRM", body: "Com o CRM conectado, o botão \"Criar campos do atendimento\" cria no negócio aderência, saúde do cliente, sinais, compromissos e cada informação a registrar, e já faz o mapeamento. A anotação e a tarefa também saem." },
      { route: "/", target: "dash-area", title: "Painel de atendimento", body: "Na Visão geral, a aba Atendimento mostra aderência média, clientes em risco, saúde dos clientes, etapas por playbook e os sinais mais frequentes." },
    ],
  },
  equipe: {
    title: "Equipe",
    steps: [
      { route: "/equipe", target: "equipe-adicionar", title: "Adicionar pessoa", body: "Convide por link (a pessoa cria a própria senha) ou crie o acesso com uma senha inicial. Escolha o papel e a equipe." },
      { route: "/equipe", target: "equipe-equipes", title: "Equipes", body: "Crie grupos como SDRs, Closers ou Regional Sul para organizar o time." },
      { route: "/equipe", target: "equipe-lista", title: "O time", body: "Edite nome, papel e equipe, redefina a senha ou remova o acesso. Convites ainda não aceitos aparecem acima, com o link para copiar." },
    ],
  },
  extensao: {
    title: "Extensão do Chrome",
    steps: [
      { route: "/extensao", target: "ext-instalar", title: "Instale", body: "Abre a Chrome Web Store. Clique em Usar no Chrome; a extensão entra na sua conta sozinha." },
      { route: "/extensao", target: "ext-passos", title: "Como gravar", body: "Ao entrar numa reunião, clique em Gravar no cartão do Sales Coach e confirme Compartilhar. Ao sair da chamada, a gravação é enviada sozinha." },
    ],
  },
};

// ── Ajuda ───────────────────────────────────────────────────────────────────

export const ARTICLES: HelpArticle[] = [
  {
    id: "agendas",
    title: "Agendas: suas reuniões",
    icon: CalendarDays,
    summary: "Gravar, enviar, acompanhar o status e abrir a análise de cada reunião.",
    route: "/agendas",
    tour: "agendas",
    sections: [
      {
        title: "Como uma reunião entra",
        items: [
          "Pela extensão do Chrome: grava a chamada do Meet ou do Teams e envia sozinha.",
          "Em Nova Agenda (admins e gestores): arquivo MP3, WAV, M4A ou MP4 de até 20 MB, ou link do Drive ou do YouTube.",
          "Em Importar em Lote: vários links do Drive ou do YouTube, um por linha.",
        ],
      },
      {
        title: "Status",
        items: [
          "Enviado → Baixando → Transcrevendo → Analisando → Completo. Leva alguns minutos.",
          "Erro: abra a reunião e clique em Tentar novamente. Travado: processando há mais de 30 minutos; tente de novo.",
          "No menu ⋮ da agenda: Editar, Refazer análise ou Apagar.",
        ],
      },
      {
        title: "Quem vê o quê",
        items: ["O executivo vê as próprias agendas. Gestores e admins veem as do time e podem filtrar por executivo e tipo."],
      },
    ],
  },
  {
    id: "reuniao",
    title: "Como ler a análise de uma reunião",
    icon: FileSearch,
    summary: "Score, temperatura, metodologia, insights, próximos passos e transcrição.",
    tour: "reuniao",
    sections: [
      {
        title: "Números",
        items: [
          "Score geral (0 a 100): verde a partir de 75, amarelo a partir de 55.",
          "Temperatura: o quanto o lead está pronto para avançar, nas faixas definidas pela empresa.",
          "Talk ratio: quanto o vendedor e o cliente falaram. Em descoberta, o cliente deve falar mais.",
          "Critérios da metodologia (ex.: BANT), além de MEDDIC e SPIN.",
        ],
      },
      {
        title: "O que fazer com a análise",
        items: [
          "Insights: o que foi bem e o que faltou.",
          "Sales Coach: próximos passos e sugestões para a próxima conversa.",
          "Highlights: objeções, sinais de compra, dores e momentos-chave.",
          "Aderência à base de conhecimento: se a conversa bateu com o que a empresa vende.",
        ],
      },
      {
        title: "Compartilhar e CRM",
        items: [
          "Compartilhar gera um link externo (análise, transcrição e gravação) com validade de 1 a 90 dias.",
          "Com o CRM conectado, a análise vai para o negócio; se ele não for achado, escolha o negócio no card do CRM.",
        ],
      },
    ],
  },
  {
    id: "extensao",
    title: "Gravar com a extensão do Chrome",
    icon: MonitorSmartphone,
    summary: "Instalar, gravar em um clique e o que fazer se algo falhar.",
    route: "/extensao",
    tour: "extensao",
    sections: [
      {
        title: "Gravar",
        items: [
          "Ao entrar numa reunião do Meet ou do Teams, aparece o cartão Gravar esta reunião?. Clique em Gravar e confirme Compartilhar, com o áudio da guia ligado.",
          "Um painel mostra a transcrição e dicas ao vivo; só você o vê.",
          "Ao sair da chamada, a gravação é enviada sozinha.",
        ],
      },
      {
        title: "Se algo falhar",
        items: [
          "Se o envio falhar, o painel oferece Baixar a gravação: envie o arquivo depois em Agendas → Nova Agenda.",
          "Se pedir login, abra o Sales Coach neste navegador ou clique em Entrar pelo Sales Coach na extensão.",
          "Para não ver o cartão, desmarque a opção no ícone da extensão.",
        ],
      },
    ],
  },
  {
    id: "agenda-conexao",
    title: "Conectar o Google Agenda ou o Outlook",
    icon: CalendarCheck,
    summary: "Para as gravações chegarem com título, participantes e lead.",
    route: "/agendas",
    tour: "agendas",
    sections: [
      {
        title: "Como funciona",
        items: [
          "Em Agendas → Sua agenda, clique em Conectar e autorize. O acesso é só de leitura.",
          "Ao gravar, o Sales Coach acha o evento da reunião e traz o título e os participantes. O lead é o primeiro participante de fora da sua empresa.",
          "Link avulso, que não está na agenda, segue com o título da aba; a análise identifica o lead pela conversa.",
          "Se aparecer Reconectar, o acesso expirou: clique e autorize de novo.",
        ],
      },
    ],
  },
  {
    id: "visao-geral",
    title: "Visão geral do time",
    icon: BarChart3,
    summary: "Indicadores, evolução dos scores e ranking de vendedores.",
    route: "/",
    tour: "visao-geral",
    roles: MGMT,
    sections: [
      {
        title: "O que tem",
        items: [
          "Total de agendas, score médio, reuniões quentes e vendedores ativos.",
          "Evolução de scores, temperatura das agendas, médias da metodologia, MEDDIC, SPIN e talk ratio.",
          "Ranking de vendedores. Com o filtro, o resumo de uma pessoa só.",
          "Com playbooks de atendimento, as abas Vendas e Atendimento separam os números. Em Atendimento: aderência ao playbook, clientes em risco, saúde dos clientes, etapas e sinais.",
        ],
      },
    ],
  },
  {
    id: "conhecimento",
    title: "Base de conhecimento",
    icon: BookOpen,
    summary: "Materiais da empresa que a IA usa para avaliar as reuniões.",
    route: "/conhecimento",
    tour: "conhecimento",
    roles: MGMT,
    sections: [
      {
        title: "O que enviar",
        items: [
          "Documentos: PDF, DOC, DOCX, TXT, CSV, XLS, XLSX, links (inclusive Google Sheets) ou texto.",
          "Produtos & Serviços: produtos, serviços e cases, com descrição e categoria.",
          "Depois de adicionar, o admin clica em Treinar IA para processar.",
        ],
      },
    ],
  },
  {
    id: "argumentos",
    title: "Gerador de argumentos",
    icon: Sparkles,
    summary: "Argumentos, ROI, frases prontas e objeções a partir do contexto do lead.",
    route: "/argumentos",
    tour: "argumentos",
    sections: [
      {
        title: "Como usar",
        items: [
          "Preencha o contexto do lead, o público-alvo, o tipo de oferta e pelo menos uma dor.",
          "Clique em Gerar Argumentos. Resultado em quatro abas: Argumentos, ROI, Frases (proposta, WhatsApp, e-mail, reunião ao vivo) e Objeções.",
        ],
      },
    ],
  },
  {
    id: "treino",
    title: "Modo de treino",
    icon: Dumbbell,
    summary: "Simular uma reunião com um cliente e receber avaliação.",
    route: "/treino",
    tour: "treino",
    sections: [
      {
        title: "Como usar",
        items: [
          "Escolha o tipo de reunião, a dificuldade (fácil, média, difícil), o foco da dor e o momento da relação.",
          "Treine por texto ou por chamada de voz.",
          "Clique em Encerrar e avaliar: score, temperatura, critérios, o que foi bem, o que faltou e o que fazer na próxima.",
          "Seus treinos ficam em Treinos recentes.",
        ],
      },
    ],
  },
  {
    id: "usuarios",
    title: "Equipe: acessos, papéis e equipes",
    icon: Users,
    summary: "Convidar pessoas, mudar papel, redefinir senha e organizar equipes.",
    route: "/equipe",
    tour: "equipe",
    roles: ["admin"],
    sections: [
      {
        title: "Papéis",
        items: [
          "Admin: configura a empresa, os usuários e o CRM, e vê tudo.",
          "Gestor: vê as agendas e a visão geral do time.",
          "Executivo: grava e vê as próprias reuniões.",
        ],
      },
      {
        title: "Como trazer alguém",
        items: [
          "Equipe → Adicionar pessoa → Convidar por link: informe o e-mail, o papel e a equipe e envie o link. A pessoa cria a própria senha.",
          "Ou Criar com senha: você define nome, e-mail e senha inicial e passa para a pessoa.",
          "Convites pendentes ficam no topo da tela, com o link para copiar de novo ou cancelar.",
        ],
      },
      {
        title: "Depois",
        items: [
          "Editar: nome, papel e equipe. Redefinir senha. Remover: a pessoa perde o acesso; as reuniões dela ficam na empresa.",
          "Equipes: crie grupos (SDRs, Closers, Regional) no botão Equipes.",
          "\"Sem acesso\" marca cadastros antigos sem login: aparecem nos relatórios, mas não entram no sistema.",
        ],
      },
    ],
  },
  {
    id: "configuracoes",
    title: "Tipos de reunião, metodologia e marca",
    icon: Settings,
    summary: "Tipos de reunião, critérios de qualificação, temperatura, persona da IA, logo e cores.",
    route: "/configuracoes",
    tour: "configuracoes",
    roles: ["admin"],
    sections: [
      {
        title: "Tipos de reunião",
        items: [
          "Configurações → Tipos de reunião: crie (ex.: Diagnóstico, Proposta, Follow-up), mude a ordem e ative ou desative.",
          "Cada tipo pode ter instruções para a análise, como o que o vendedor deve cobrir naquela etapa.",
          "Tipo já usado em reuniões não é apagado, só desativado: as reuniões antigas continuam com ele.",
        ],
      },
      {
        title: "Metodologias de análise",
        items: [
          "Configurações → Metodologias de análise: crie quantas quiser, a partir de modelos prontos (BANT, SPICED, GPCTBA/C&I, ANUM, CHAMP, MEDDIC, MEDDPICC, Sandler) ou do zero.",
          "Uma é a padrão (estrela). Em Tipos de reunião, cada tipo pode usar outra: por exemplo, BANT na primeira reunião e SPICED na proposta.",
          "Em cada metodologia: nome, persona da IA, critérios com peso (o ideal é somar 100), faixas de temperatura e regras da operação.",
          "Análises extras: ligue ou desligue MEDDIC e SPIN, que aparecem além da metodologia principal.",
          "Cada análise guarda a metodologia com que foi feita; mudar depois não altera as reuniões já analisadas (use Refazer análise para isso).",
        ],
      },
      {
        title: "Playbooks de atendimento",
        items: [
          "Para CS, suporte e onboarding: Configurações → Playbooks de atendimento. Veja a ajuda \"Coach de atendimento\" para o passo a passo.",
        ],
      },
      {
        title: "Identidade visual",
        items: ["Nome do produto, logo, cores, e-mail de suporte e textos da tela de login."],
      },
    ],
  },
  {
    id: "crm",
    title: "Integração com o CRM",
    icon: Plug,
    summary: "RD Station CRM, HubSpot, Pipedrive e Kommo.",
    route: "/configuracoes",
    tour: "configuracoes",
    roles: ["admin"],
    sections: [
      {
        title: "O que vai para o CRM",
        items: [
          "Ao fim de cada análise: anotação com o resumo e tarefa do próximo passo no negócio.",
          "Campos do negócio (ex.: temperatura, score), escolhendo se sempre ou só quando vazios.",
          "Se o negócio não for achado pelo e-mail do lead, escolha-o no card do CRM da reunião.",
        ],
      },
      {
        title: "Conversas de atendimento",
        items: [
          "Conversas avaliadas por playbook mandam os próprios dados: aderência, saúde do cliente, sinais de risco, oportunidades, etapas não cumpridas, compromissos, pendências e cada informação a registrar dos playbooks.",
          "\"Criar campos do atendimento\" cria esses campos no negócio e já faz o mapeamento. Dados de venda (nota, temperatura, critérios) não saem dessas conversas.",
        ],
      },
    ],
  },
  {
    id: "atendimento",
    title: "Coach de atendimento (CS, suporte, onboarding)",
    icon: ClipboardList,
    summary: "Playbooks no lugar da metodologia de vendas: aderência, saúde do cliente e sinais de risco.",
    route: "/configuracoes",
    tour: "atendimento",
    roles: ALL,
    sections: [
      {
        title: "O que é",
        items: [
          "A versão do coach para times que não vendem: Customer Success, suporte, onboarding, renovação.",
          "Em vez de critérios de qualificação, a IA avalia a conversa pelo playbook da empresa: as etapas cumpridas (com o trecho que comprova), a saúde do cliente (crítico, em risco, atenção, saudável, promotor) e os sinais de risco e de oportunidade.",
          "O coach ao vivo da extensão orienta pela etapa que falta, pelo sinal de risco que apareceu, pela dúvida do cliente e pelo compromisso a combinar.",
        ],
      },
      {
        title: "Configurar (admin), em 5 passos",
        items: [
          "1. Configurações → Playbooks de atendimento → Novo playbook, a partir de um modelo (Onboarding, Check-in, QBR, Renovação, Suporte, Recuperação de cliente em risco). Ou \"Montar a partir do nosso playbook\": cole o playbook do time e a IA estrutura.",
          "2. Ajuste o objetivo da conversa e as etapas, com peso (somando 100) e quais são obrigatórias.",
          "3. Revise boas práticas, o que não pode acontecer, os sinais a detectar, as informações a registrar e as faixas de saúde.",
          "4. Salve. O tipo de reunião com o mesmo nome nasce ligado ao playbook. Para ligar um tipo que já existe: Tipos de reunião → abra o tipo → Metodologia ou playbook de análise.",
          "5. Com o CRM conectado: Integração com CRM → Criar campos do atendimento.",
        ],
      },
      {
        title: "No dia a dia (time de atendimento)",
        items: [
          "Grave pela extensão como numa reunião de venda e escolha o tipo da conversa (ex.: Onboarding). É o tipo que define o playbook usado.",
          "Na análise: aderência ao playbook, saúde do cliente, etapas com status, sinais detectados, condução, compromissos e pendências.",
          "Gestores: Visão geral → aba Atendimento, com clientes em risco e os sinais mais frequentes do time.",
        ],
      },
    ],
  },
  {
    id: "assistente",
    title: "Assistente de vendas",
    icon: Bot,
    summary: "Perguntas sobre as suas agendas, em linguagem natural.",
    sections: [
      {
        title: "O que perguntar",
        items: [
          "\"Quais agendas ficaram mornas essa semana?\"",
          "\"Como está o score médio do time este mês?\"",
          "\"Quais objeções mais aparecem nas minhas reuniões?\"",
          "O executivo só vê os próprios dados. Nova conversa começa do zero.",
        ],
      },
    ],
  },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Quanto tempo leva a análise?", a: "Alguns minutos depois de a gravação chegar. Acompanhe o status em Agendas: Transcrevendo, Analisando e Completo." },
  { q: "A reunião ficou com Erro. E agora?", a: "Abra a reunião e clique em Tentar novamente. Se persistir, confira se o arquivo tem áudio e menos de 20 MB, ou se o link do Drive está aberto para qualquer pessoa com o link." },
  { q: "O cliente percebe que estou gravando?", a: "Pela extensão, o Chrome mostra que a aba está sendo compartilhada só para você. Avise o cliente no início, como pede a LGPD." },
  { q: "A gravação veio sem o áudio do cliente.", a: "Atualize a extensão (1.11 ou mais nova): ela grava a voz do cliente direto da chamada, mesmo com fone. Nas versões antigas, deixe ligado Compartilhar áudio da guia e use o alto-falante padrão no Meet." },
  { q: "As dicas ao vivo confundem o que eu e o cliente dissemos.", a: "O live ouve duas trilhas: o seu microfone (você) e o áudio da aba (cliente). Use fone de ouvido: sem ele, o microfone também capta a voz do cliente saindo da caixa de som." },
  { q: "O título ou o lead da reunião vieram errados.", a: "Conecte sua agenda em Agendas para virem do convite. Dá para corrigir a qualquer momento no menu ⋮ → Editar da agenda." },
  { q: "Como mudar os critérios da análise?", a: "Admins: Configurações → Metodologia de análise. As próximas análises seguem os novos critérios; para uma antiga, use Refazer análise." },
  { q: "Temos um time de CS. Dá para usar?", a: "Sim. Crie um playbook em Configurações → Playbooks de atendimento e ligue-o ao tipo de reunião do CS. As conversas desse tipo são avaliadas pelo playbook, com saúde do cliente e sinais de risco. Veja a ajuda \"Coach de atendimento\"." },
  { q: "Como o Sales Coach sabe se a conversa é de venda ou de atendimento?", a: "Pelo tipo de reunião escolhido na gravação: cada tipo aponta para uma metodologia (venda) ou para um playbook (atendimento). Sem playbook ligado, vale a metodologia padrão." },
  { q: "Quem vê as minhas reuniões?", a: "Você, os gestores e os admins da sua empresa. Fora dela, só quem receber um link de compartilhamento que você criar." },
];

/** Artigo da tela aberta, para "Como funciona esta tela". */
export function articleForPath(path: string): HelpArticle | undefined {
  if (/^\/agendas\/[^/]+/.test(path)) return ARTICLES.find((a) => a.id === "reuniao");
  return ARTICLES.find((a) => a.route === path);
}
