import {
  BarChart3, BookOpen, House, Bot, CalendarCheck, CalendarDays, ClipboardList, Dumbbell, FileSearch, MonitorSmartphone, Plug, Settings,
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
      "Google Agenda ou Outlook, só leitura. As gravações já chegam com o título da reunião, os participantes e o lead (nome e e-mail). No Google, se aparecer \"O Google não verificou este app\", clique em Avançado → Acessar Sales Coach (não seguro) e marque a caixa da agenda. O passo a passo fica ao lado do botão Conectar, em Agendas.",
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
      "Entre numa chamada do Meet ou do Teams e clique em Gravar no cartão do Sales Coach. Admins e gestores também podem enviar um arquivo ou um link do Google Drive em Agendas → Nova Agenda.",
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
    route: "/visao-geral",
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
    { target: "nav-inicio", title: "Início", body: "A sua primeira tela todo dia: as reuniões de hoje, o que está pendente, o seu ritmo e uma dica escrita pela IA a partir das suas reuniões." },
    { target: "nav-agendas", title: "Agendas", body: "Todas as reuniões gravadas, com status, score e temperatura. Clique numa reunião para ver a análise completa." },
    mgmt && { target: "nav-visao-geral", title: "Visão geral", body: "Indicadores do time: evolução dos scores, temperatura das agendas, médias da metodologia e ranking de vendedores." },
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
      { route: "/agendas", target: "agenda-conectar", title: "Sua agenda", body: "Conecte o Google Agenda ou o Outlook. As gravações já chegam com o título, os participantes e o lead. Se o Google avisar que não verificou o app, abra Ver o passo a passo, logo abaixo do botão." },
      { route: "/agendas", target: "agendas-visao", title: "Minha agenda", body: "Com a agenda conectada, a aba Minha agenda mostra a sua semana como no Google Agenda: reuniões com cliente, as que foram gravadas (com o score) e as que passaram sem gravação. Clique numa reunião para entrar na chamada ou abrir a análise." },
      { route: "/agendas", target: "robo-automatico", title: "Robô automático", body: "Na aba Minha agenda, escolha em quais reuniões o robô de reunião entra sozinho para gravar: só quando você mandar, reuniões com cliente ou todas com link. As reuniões com o ícone de robô serão gravadas por ele. Em cada reunião dá para trocar em Como gravar esta reunião: Robô, Extensão ou Não gravar." },
      { route: "/agendas", target: "nova-agenda", title: "Nova Agenda", body: "Envie um arquivo (MP3, WAV, M4A ou MP4, até 20 MB) ou cole o link da gravação no Google Drive. Para vários links, use Importar em Lote." },
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
      { route: "/visao-geral", target: "dash-filtro", title: "Filtro de vendedor", body: "Veja o time todo ou uma pessoa só." },
      { route: "/visao-geral", target: "dash-stats", title: "Indicadores", body: "Total de agendas, score médio, reuniões quentes e vendedores ativos." },
      { route: "/visao-geral", target: "dash-graficos", title: "Gráficos", body: "Evolução dos scores, temperatura das agendas, médias da metodologia, talk ratio e ranking de vendedores." },
    ],
  },
  conhecimento: {
    title: "Base de conhecimento",
    steps: [
      { route: "/conhecimento", target: "kb-abas", title: "Documentos e Produtos & Serviços", body: "Documentos: materiais da empresa. Produtos & Serviços: o catálogo, com descrição e categoria." },
      { route: "/conhecimento", target: "kb-adicionar", title: "Adicionar", body: "Envie PDF, Word, TXT, CSV ou planilha, cole um link (inclusive Google Sheets) ou escreva o texto. Escolha também a área: Vendas, Atendimento ou as duas." },
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
      { route: "/configuracoes", target: "cfg-playbooks-novo", title: "1. Comece por um modelo", body: "Novo playbook traz modelos prontos: Onboarding, Check-in de acompanhamento, Revisão de resultados (QBR), Renovação, Expansão de conta (upsell e cross-sell), Atendimento de suporte e Recuperação de cliente em risco." },
      { route: "/configuracoes", target: "cfg-playbooks-ia", title: "…ou monte a partir do playbook de vocês", body: "Cole o texto do playbook do time (roteiro, checklist, política de atendimento). A IA estrutura em etapas, sinais e faixas de saúde. Nada é salvo antes da sua revisão." },
      { route: "/configuracoes", target: "cfg-playbooks-etapas", title: "2. Ajuste as etapas", body: "Na ordem em que acontecem, com peso (o ideal é somar 100) e a marca de obrigatória. A aderência ao playbook é a soma dos pontos das etapas." },
      { route: "/configuracoes", target: "cfg-playbooks-sinais", title: "3. Sinais e informações a registrar", body: "Sinais: o que o cliente diz que indica risco (cancelar, insatisfação), oportunidade (expansão, indicação) ou atenção. Informações a registrar: o que a IA anota quando aparece (data de go-live, responsável no cliente) e que pode ir para o CRM." },
      { route: "/configuracoes", target: "cfg-playbooks-salvar", title: "4. Salve", body: "Ao salvar um playbook novo, o tipo de reunião com o mesmo nome já é criado e ligado a ele. O time de CS grava pela extensão escolhendo esse tipo, e a conversa é avaliada pelo playbook." },
      { route: "/configuracoes", target: "cfg-tipos", title: "Tipos de reunião", body: "Para ligar um tipo que já existe a um playbook, abra o tipo e escolha o playbook em \"Metodologia ou playbook de análise\"." },
      { route: "/configuracoes", target: "cfg-crm-atendimento", title: "5. CRM", body: "Com o CRM conectado, o botão \"Criar campos do atendimento\" cria no negócio aderência, saúde do cliente, sinais, compromissos e cada informação a registrar, e já faz o mapeamento. A anotação e a tarefa também saem." },
      { route: "/visao-geral", target: "dash-area", title: "Painel de atendimento", body: "Na Visão geral, a aba Atendimento mostra aderência média, clientes em risco, saúde dos clientes, etapas por playbook e os sinais mais frequentes." },
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
      { route: "/extensao", target: "ext-passos", title: "Como gravar", body: "Ao entrar numa reunião, clique em Gravar no cartão do Sales Coach. Por padrão grava só o áudio, sem compartilhar a tela. Ao sair da chamada, a gravação é enviada sozinha." },
      { route: "/extensao", target: "ext-requisitos", title: "Requisitos para gravar a tela", body: "Gravar a tela exige pelo menos um i5 de 8ª geração (ou Ryzen 5, ou Apple M1) e 8 GB de memória. Com i3, grave só o áudio para a reunião não travar." },
      { route: "/extensao", target: "ext-leve", title: "Para a reunião não travar", body: "Vai apresentar slides? Deixe desmarcado Gravar também a tela. Só o áudio quase não pesa no computador." },
    ],
  },
};

// ── Ajuda ───────────────────────────────────────────────────────────────────

export const ARTICLES: HelpArticle[] = [
  {
    id: "inicio",
    title: "Início: o seu dia no Sales Coach",
    icon: House,
    summary: "Reuniões de hoje, pendências, o seu ritmo, a dica do dia e, para gestores, o time.",
    route: "/",
    sections: [
      {
        title: "Seu dia",
        items: [
          "Hoje: as reuniões da sua agenda, com o botão Entrar e gravar na próxima. Precisa da agenda conectada em Agendas.",
          "Pendências, sem nada para marcar: análises com erro para tentar de novo, reuniões com cliente da última semana que passaram sem gravação e os primeiros passos que faltam.",
          "Seu ritmo: score médio dos últimos 30 dias, a tendência contra os 30 dias anteriores e as reuniões gravadas na semana.",
          "Dica do dia: escrita pela IA uma vez por dia, a partir das suas últimas reuniões analisadas (o critério da metodologia em que você está mais fraco), da metodologia e da base de conhecimento da empresa. Traz uma frase pronta para a próxima reunião.",
          "Você sabia?: um recurso do Sales Coach por dia.",
          "Novidades: o que mudou no Sales Coach nos últimos 30 dias. Cada novidade aparece uma vez numa janela O que há de novo, quando você abre o Sales Coach, e fica no Início.",
        ],
      },
      {
        title: "Seu time (admin e gestor)",
        items: [
          "Admin e gestor também veem o próprio dia, porque gravam as próprias reuniões. Abaixo, o time: o gestor vê a própria equipe; o admin, a empresa toda.",
          "Atenção: quem caiu 8 pontos ou mais no score, quem não grava há 7 dias ou nunca gravou, e análises do time com erro.",
          "Destaques: a melhor reunião da semana (vale ouvir com o time), os leads quentes e o critério mais fraco do time, como pauta para o próximo treino.",
          "Por pessoa: reuniões gravadas na semana e score de 30 dias com a tendência.",
          "Só reuniões gravadas: a agenda dos vendedores não aparece para ninguém além deles.",
          "Gestor ou admin com poucas reuniões próprias recebe uma dica de gestão, a partir das reuniões do time.",
        ],
      },
    ],
  },
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
          "Em Nova Agenda (admins e gestores): arquivo MP3, WAV, M4A ou MP4 de até 20 MB, ou o link da gravação no Google Drive (compartilhado com \"Qualquer pessoa com o link\"). Também vale Dropbox ou o link direto do arquivo.",
          "Em Importar em Lote: vários links de gravações, um por linha.",
          "YouTube não funciona: o vídeo não pode ser baixado para transcrição. Baixe e envie o arquivo, ou suba no Drive. Links de pasta, de documento ou de página (Zoom, Loom) também não: use o link do arquivo da gravação.",
          "Já tem a transcrição? Abra a agenda, cole em \"Já tem a transcrição? Cole aqui\" e clique em Tentar novamente.",
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
          "Ao entrar numa reunião do Meet ou do Teams, aparece o cartão Gravar esta reunião?. Clique em Gravar. Na primeira vez, permita o microfone.",
          "Por padrão (versão 1.12 ou mais nova), grava só o áudio: a sua voz e a do cliente, que vem direto da chamada. Não abre o seletor de tela. Funciona com fone, e o cliente que entra depois entra na gravação sozinho.",
          "Quer o vídeo? Confira antes se o computador atende aos requisitos para gravar a tela (página Extensão do Chrome). Se atender, marque Gravar também a tela no cartão ou no ícone da extensão. O Chrome pede a aba da reunião: deixe ligado Compartilhar áudio da guia e clique em Compartilhar. A tela é gravada em 540p.",
          "Computador mais fraco ou quer o vídeo da chamada sem pesar nada? Use o robô de reunião (ajuda Robô de reunião): ele entra na chamada e grava áudio e vídeo pelos servidores do Sales Coach.",
          "Reunião com o robô: o cartão mostra \"O robô grava esta reunião\" e o botão Ligar dicas ao vivo. A extensão só ouve para as dicas (o painel mostra AO VIVO em azul, não REC) e não grava nada. Encerrar as dicas não para o robô.",
          "Reunião marcada como Não gravar na Minha agenda: o cartão não aparece. Para gravar mesmo assim, use o ícone da extensão.",
          "Até a versão 1.11, o Chrome sempre pede a aba da reunião: escolha a aba com Compartilhar áudio da guia ligado. Veja a versão em chrome://extensions.",
          "Um painel mostra a transcrição e dicas ao vivo; só você o vê.",
          "Ao sair da chamada, a gravação é enviada sozinha.",
        ],
      },
      {
        title: "Requisitos para gravar a tela",
        items: [
          "Só o áudio (o padrão) funciona em qualquer computador que já roda o Meet ou o Teams sem travar.",
          "Para gravar também a tela, o mínimo é: processador Intel Core i5 de 8ª geração ou mais novo, AMD Ryzen 5 ou mais novo, ou Mac com chip Apple M1 ou mais novo; 8 GB de memória; Chrome atualizado e o carregador do notebook ligado.",
          "Com Intel Core i3, Celeron, Pentium, AMD Athlon, Ryzen 3 ou 4 GB de memória, gravar a tela deixa a reunião lenta e travando. Nesses computadores, deixe desmarcado Gravar também a tela: a análise usa só o áudio, então o resultado é o mesmo.",
          "Como ver o seu computador: no Windows, Configurações → Sistema → Sobre (linhas Processador e RAM instalada). No Mac, menu Apple → Sobre este Mac (Chip ou Processador, e Memória).",
          "Como ler: em Intel Core i5-1135G7, o tipo é i5 e o 1135 indica a 11ª geração; 8250 seria a 8ª. Em Intel Core i3-1005G1, o tipo é i3: grave só o áudio.",
          "Travou gravando a tela? Pare no botão vermelho do painel (o que foi gravado é enviado) e, na próxima, deixe a tela desmarcada.",
        ],
      },
      {
        title: "Para a reunião não travar (apresentando slides)",
        items: [
          "Vai apresentar slides ou compartilhar a tela no Meet? Deixe desmarcado Gravar também a tela. Gravar a tela junto com a apresentação era o que deixava a chamada lenta e travando.",
          "Só o áudio quase não pesa no computador, e a análise usa só o áudio.",
          "Se a chamada ficar lenta numa versão até a 1.11, pare a gravação antes de apresentar e atualize a extensão.",
        ],
      },
      {
        title: "Se algo falhar",
        items: [
          "O Chrome pediu para compartilhar a aba sem você marcar a tela? A extensão foi instalada ou atualizada com a reunião já aberta. Escolha a aba da reunião (só o áudio é gravado) ou recarregue a aba da reunião antes de gravar.",
          "O painel avisou que não está ouvindo o cliente? Clique em Ouvir o cliente pela aba, no próprio aviso, e compartilhe a aba da reunião com Compartilhar áudio da guia: a gravação continua. Sem o botão (versão anterior à 1.12.1), pare, recarregue a aba da reunião e grave de novo.",
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
          "Em Agendas → Sua agenda, clique em Conectar Google Agenda (ou Conectar Outlook) e autorize. O acesso é só de leitura: o Sales Coach não cria, não altera e não apaga eventos.",
          "Ao gravar, o Sales Coach acha o evento da reunião e traz o título e os participantes. O lead é o primeiro participante de fora da sua empresa.",
          "Link avulso, que não está na agenda, segue com o título da aba; a análise identifica o lead pela conversa.",
          "Se aparecer Reconectar, o acesso expirou ou a permissão da agenda ficou desmarcada: clique e autorize de novo, marcando a caixa da agenda.",
        ],
      },
      {
        title: "Minha agenda",
        items: [
          "Com a agenda conectada, Agendas ganha a aba Minha agenda: a sua agenda principal, por semana ou por dia (no celular, a lista do dia).",
          "Cores: azul é reunião com cliente; verde, reunião gravada (com o score); tracejada, reunião com cliente que passou sem gravação; cinza, reunião interna, sem ninguém de fora da empresa.",
          "Clique numa reunião para ver os participantes e o lead, entrar na chamada, abrir a análise ou abrir o evento no Google Agenda ou no Outlook.",
          "No topo, quantas reuniões com cliente da semana foram gravadas.",
          "Ícone de robô numa reunião: o robô de reunião vai entrar e gravar. Logo abaixo das cores fica a escolha do Robô automático (veja a ajuda Robô de reunião).",
          "Cada pessoa vê só a própria agenda; gestores e admins não veem a agenda do time. É só leitura e nada da agenda fica guardado no Sales Coach.",
        ],
      },
      {
        title: "Google Agenda: passo a passo do consentimento",
        items: [
          "1. Agendas → Sua agenda → Conectar Google Agenda.",
          "2. Escolha a sua conta do Google do trabalho, a mesma das reuniões com clientes.",
          "3. Se aparecer \"O Google não verificou este app\", não clique no botão azul: clique em Avançado, no canto inferior esquerdo, e depois em Acessar Sales Coach (não seguro). O aviso aparece enquanto o Google conclui a verificação do Sales Coach.",
          "4. Na tela \"O Sales Coach quer acessar sua Conta do Google\", marque a caixa Ver eventos em todas as suas agendas (ou Selecionar tudo) e clique em Continuar. Sem essa caixa marcada, a agenda não conecta.",
          "5. Você volta ao Sales Coach com a mensagem Agenda conectada.",
          "O passo a passo também fica no quadro Sua agenda, em Agendas: clique em Ver o passo a passo.",
        ],
      },
      {
        title: "Se o Google bloquear",
        items: [
          "\"Acesso bloqueado\" ou sem a opção Avançado: a empresa usa Google Workspace e bloqueia apps ainda não verificados. O administrador do Google Workspace libera em admin.google.com → Segurança → Acesso e controle de dados → Controles de API → Gerenciar acesso de apps de terceiros → Configurar novo app: procura Sales Coach (ou o ID do app, que o suporte envia) e marca como Confiável.",
          "No Outlook, \"Precisa de aprovação do administrador\": o administrador do Microsoft 365 da empresa aprova o Sales Coach uma vez.",
        ],
      },
    ],
  },
  {
    id: "robo",
    title: "Robô de reunião: gravar sem a extensão",
    icon: Bot,
    summary: "Um participante que entra no Meet, no Teams ou no Zoom e grava a chamada, sozinho ou quando você mandar.",
    route: "/agendas",
    tour: "agendas",
    sections: [
      {
        title: "O que é",
        items: [
          "O robô entra na chamada como um participante chamado \"Sales Coach · gravando para\" e o seu primeiro nome. Ele grava o áudio e o vídeo da chamada (quem está falando e a tela compartilhada).",
          "Quem grava são os servidores do Sales Coach: o seu computador não grava nada, então a reunião não fica lenta, mesmo apresentando slides.",
          "Quando a reunião acaba, a gravação vai sozinha para a análise e aparece em Agendas, com o vídeo no player.",
          "Funciona em reuniões do Google Meet, do Microsoft Teams e do Zoom que estejam na sua agenda conectada, com o link da chamada no convite.",
        ],
      },
      {
        title: "Robô ou extensão?",
        items: [
          "Robô: grava áudio e vídeo sem pesar no computador e não precisa de nada instalado. O cliente vê o robô entre os participantes.",
          "Extensão do Chrome: grava o áudio pelo seu navegador, sem participante a mais na chamada.",
          "As dicas ao vivo são sempre da extensão. Com o robô na reunião, o cartão da extensão muda para \"O robô grava esta reunião\" e oferece Ligar dicas ao vivo: a extensão só ouve, não grava nada, e a gravação do robô entra na mesma reunião, com a transcrição ao vivo. Nada é gravado duas vezes.",
          "Vale avisar o cliente no começo que a reunião está sendo gravada, como em qualquer gravação.",
        ],
      },
      {
        title: "Robô automático: em quais reuniões ele entra sozinho",
        items: [
          "Em Agendas → Minha agenda, escolha no Robô automático: Só quando eu mandar (o padrão), Reuniões com cliente (alguém de fora da empresa foi convidado) ou Todas as reuniões com link (inclui as internas, como dailies e 1:1).",
          "Cada pessoa escolhe para a própria agenda. A escolha vale a partir da hora em que você muda.",
          "As reuniões em que o robô vai entrar ficam com o ícone de robô. Ele é agendado nas 24 horas antes de cada reunião.",
          "Ele não entra em reunião que você recusou, sem link de chamada, ou que a extensão já está gravando.",
          "Se a reunião muda de horário ou de link, o robô acompanha. Se ela sai da agenda, o robô é tirado.",
        ],
      },
      {
        title: "Reunião por reunião: Robô, Extensão ou Não gravar",
        items: [
          "Clique na reunião na Minha agenda. Em Como gravar esta reunião, escolha Robô, Extensão ou Não gravar. Vem marcado pelo Robô automático; o que você escolher vale só para aquela reunião e não volta sozinho.",
          "Robô: o robô entra na hora da reunião (com o Robô automático, ele é agendado nas 24 horas antes). Na chamada, a extensão oferece só as dicas ao vivo.",
          "Extensão: o robô não entra. Ao entrar na chamada, clique em Gravar no cartão do Sales Coach.",
          "Não gravar: o robô não entra e o cartão da extensão não aparece. Se mudar de ideia na hora, grave pelo ícone da extensão.",
          "Trocar de Robô para Extensão ou Não gravar com o robô já na chamada faz o robô sair.",
          "O status do robô aparece logo abaixo da escolha: agendado, entrando, na sala de espera, gravando, preparando a gravação e gravação enviada para análise. Se ele não gravou, aparece o motivo; escolha Robô para mandar de novo.",
        ],
      },
      {
        title: "Na hora da reunião",
        items: [
          "Se a reunião tem sala de espera, aceite a entrada do robô. Ele espera até 15 minutos e depois desiste.",
          "Ele sai sozinho quando todos saem da chamada, ou depois de 15 minutos se ninguém entrar.",
          "Cada gravação conta como uma análise do plano da empresa. Se o limite acabar, a reunião mostra o aviso e o robô não é agendado.",
        ],
      },
    ],
  },
  {
    id: "visao-geral",
    title: "Visão geral do time",
    icon: BarChart3,
    summary: "Indicadores, evolução dos scores e ranking de vendedores.",
    route: "/visao-geral",
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
      {
        title: "Vendas, Atendimento ou os dois",
        items: [
          "Cada documento tem uma área, escolhida ao adicionar e alterável na lista: Só Vendas, Só Atendimento (CS) ou Vendas e Atendimento (o padrão, e o que os documentos antigos ficaram).",
          "Reuniões de venda usam os documentos de Vendas e os das duas áreas; conversas de atendimento (avaliadas por playbook), os de Atendimento e os das duas.",
          "Se o CS também faz upsell e cross-sell numa carteira, ligue no playbook \"Nesta conversa o time também vende\": essas conversas usam os documentos das duas áreas. Preços e portfólio que os dois times usam podem ficar em Vendas e Atendimento.",
          "Produtos & Serviços valem para as duas áreas.",
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
          "A versão do coach para times que não vendem: Customer Success, suporte, onboarding, renovação. E para o CS que faz upsell e cross-sell na carteira.",
          "Em vez de critérios de qualificação, a IA avalia a conversa pelo playbook da empresa: as etapas cumpridas (com o trecho que comprova), a saúde do cliente (crítico, em risco, atenção, saudável, promotor) e os sinais de risco e de oportunidade.",
          "O coach ao vivo da extensão orienta pela etapa que falta, pelo sinal de risco que apareceu, pela dúvida do cliente e pelo compromisso a combinar.",
        ],
      },
      {
        title: "Configurar (admin), em 5 passos",
        items: [
          "1. Configurações → Playbooks de atendimento → Novo playbook, a partir de um modelo (Onboarding, Check-in, QBR, Renovação, Expansão de conta, Suporte, Recuperação de cliente em risco). Ou \"Montar a partir do nosso playbook\": cole o playbook do time e a IA estrutura.",
          "2. Ajuste o objetivo da conversa e as etapas, com peso (somando 100) e quais são obrigatórias. Se o time também vende nessa conversa (upsell, cross-sell), ligue \"Nesta conversa o time também vende\": a IA usa os materiais de Vendas da base e avalia a oferta.",
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
  { q: "O cliente percebe que estou gravando?", a: "Não: o painel da extensão só aparece para você, e os outros participantes não veem nada. Avise o cliente no início, como pede a LGPD." },
  { q: "A extensão não pegou a minha voz (o medidor \"Você\" fica parado).", a: "Na extensão 1.13.3 ou mais nova, ela usa o mesmo microfone do Meet e acompanha quando você troca nas configurações dele. Se ainda assim o painel avisar \"Não estou ouvindo o seu microfone\", clique em Usar o microfone do Meet: a gravação continua. Nas versões anteriores, a extensão usava o microfone padrão do Chrome: deixe o mesmo microfone escolhido no Meet (⋮ → Configurações → Áudio) e no Chrome (chrome://settings/content/microphone), e recarregue a aba da reunião." },
  { q: "A gravação veio sem o áudio do cliente.", a: "Atualize a extensão (1.12.1 ou mais nova): ela grava a voz do cliente direto da chamada, mesmo com fone, e avisa no painel se não estiver ouvindo. Nesse aviso, Ouvir o cliente pela aba resolve sem parar a gravação. Se a extensão foi instalada ou atualizada com a reunião aberta, recarregue a aba da reunião antes de gravar. Nas versões antigas, deixe ligado Compartilhar áudio da guia e use o alto-falante padrão no Meet." },
  { q: "A reunião trava ou fica lenta quando apresento slides.", a: "Na extensão 1.12 ou mais nova, grave só o áudio (o padrão): deixe desmarcado Gravar também a tela. Gravar a tela junto com a apresentação do Meet pesa no computador. Para gravar a tela, o computador precisa de pelo menos um Intel Core i5 de 8ª geração (ou AMD Ryzen 5, ou Mac com chip Apple M1) e 8 GB de memória; com i3, Celeron, Pentium ou 4 GB, grave só o áudio. Até a 1.11, pare a gravação antes de apresentar e atualize a extensão." },
  { q: "Apareceu \"O Google não verificou este app\" ao conectar a agenda.", a: "É esperado enquanto o Google conclui a verificação do Sales Coach. Clique em Avançado (canto inferior esquerdo) → Acessar Sales Coach (não seguro) e, na tela seguinte, marque a caixa Ver eventos em todas as suas agendas antes de Continuar. O acesso é só de leitura. Se aparecer Acesso bloqueado, o administrador do Google Workspace da empresa precisa liberar o app (veja a ajuda Conectar o Google Agenda ou o Outlook)." },
  { q: "As dicas ao vivo confundem o que eu e o cliente dissemos.", a: "O live ouve duas trilhas: o seu microfone (você) e a voz que chega pela chamada (cliente). Use fone de ouvido: sem ele, o microfone também capta a voz do cliente saindo da caixa de som." },
  { q: "Dá para ver a minha agenda dentro do Sales Coach?", a: "Sim. Conecte o Google Agenda ou o Outlook em Agendas e abra a aba Minha agenda: a sua semana, com as reuniões com cliente, as gravadas (com o score) e as que passaram sem gravação. Só você vê a sua agenda." },
  { q: "Dá para gravar sem a extensão?", a: "Sim, com o robô de reunião. Ele entra na chamada do Meet, Teams ou Zoom como participante e grava áudio e vídeo pelos servidores do Sales Coach; o seu computador não grava nada. Abra a reunião em Agendas → Minha agenda e clique em Enviar o robô, ou ligue o Robô automático. Veja a ajuda Robô de reunião." },
  { q: "Como faço o robô entrar sozinho nas minhas reuniões?", a: "Em Agendas → Minha agenda, no Robô automático, escolha Reuniões com cliente (só reuniões com alguém de fora da empresa) ou Todas as reuniões com link. As reuniões com o ícone de robô serão gravadas por ele. Precisa da agenda conectada." },
  { q: "Como tiro o robô de uma reunião só?", a: "Abra a reunião em Agendas → Minha agenda e, em Como gravar esta reunião, escolha Extensão (você grava pela extensão) ou Não gravar. As outras reuniões continuam seguindo o Robô automático. Com o robô já na chamada, a troca faz ele sair." },
  { q: "Uso o robô ou a extensão?", a: "Robô: grava áudio e vídeo sem pesar no computador, mas aparece como participante na chamada. Extensão: grava o áudio pelo seu Chrome, sem participante a mais. Escolha em cada reunião, em Agendas → Minha agenda → Como gravar esta reunião. As dicas ao vivo funcionam nos dois: com o robô, a extensão só ouve e não grava nada." },
  { q: "Como sei se a minha extensão está atualizada?", a: "Abra a página Extensão do Chrome no Sales Coach: o quadro Sua extensão mostra a versão instalada e se ela está em dia. Quando ela fica para trás, aparece um aviso no topo do Sales Coach. O Chrome atualiza sozinho em algumas horas; para atualizar na hora, abra chrome://extensions, ligue o Modo do desenvolvedor e clique em Atualizar. Quem instalou pelo arquivo, sem a loja, precisa remover essa versão e instalar pelo botão Instalar no Chrome." },
  { q: "Com o robô gravando, ainda tenho as dicas ao vivo?", a: "Sim. Ao entrar na chamada, o cartão da extensão mostra \"O robô grava esta reunião\": clique em Ligar dicas ao vivo. A extensão só ouve, sem gravar, e a gravação do robô entra na mesma reunião, junto com a transcrição ao vivo. Precisa da extensão 1.13 ou mais nova." },
  { q: "O robô não entrou na reunião.", a: "Confira na janela da reunião (Agendas → Minha agenda) o status do robô. Se ficou na sala de espera, alguém precisa aceitar a entrada dele; ele desiste depois de 15 minutos. O robô só entra em reuniões com link de Meet, Teams ou Zoom no convite, e não entra em reuniões que você recusou." },
  { q: "O título ou o lead da reunião vieram errados.", a: "Conecte sua agenda em Agendas para virem do convite. Dá para corrigir a qualquer momento no menu ⋮ → Editar da agenda." },
  { q: "Como mudar os critérios da análise?", a: "Admins: Configurações → Metodologia de análise. As próximas análises seguem os novos critérios; para uma antiga, use Refazer análise." },
  { q: "Temos um time de CS. Dá para usar?", a: "Sim. Crie um playbook em Configurações → Playbooks de atendimento e ligue-o ao tipo de reunião do CS. As conversas desse tipo são avaliadas pelo playbook, com saúde do cliente e sinais de risco. Veja a ajuda \"Coach de atendimento\"." },
  { q: "Material de CS na base de conhecimento entra na análise de vendas?", a: "Não, se o documento estiver marcado como Só Atendimento. Na Base de conhecimento, cada documento tem a área: Só Vendas, Só Atendimento ou Vendas e Atendimento. Reuniões de venda usam Vendas e as duas; conversas de atendimento, Atendimento e as duas. Playbook com \"o time também vende\" (upsell, cross-sell) usa tudo." },
  { q: "O CS também faz upsell e cross-sell. Como fica?", a: "Use o modelo de playbook Expansão de conta, ou ligue \"Nesta conversa o time também vende\" em qualquer playbook. A IA avalia se a oferta veio na hora certa e ligada a uma necessidade do cliente, confere preços e condições com os materiais de Vendas, e o coach ao vivo sugere a oferta quando o cliente abre espaço. O sinal Oportunidade de expansão vai para o CRM." },
  { q: "Como o Sales Coach sabe se a conversa é de venda ou de atendimento?", a: "Pelo tipo de reunião escolhido na gravação: cada tipo aponta para uma metodologia (venda) ou para um playbook (atendimento). Sem playbook ligado, vale a metodologia padrão." },
  { q: "Quem vê as minhas reuniões?", a: "Você, os gestores e os admins da sua empresa. Fora dela, só quem receber um link de compartilhamento que você criar." },
];

/** Artigo da tela aberta, para "Como funciona esta tela". */
export function articleForPath(path: string): HelpArticle | undefined {
  if (/^\/agendas\/[^/]+/.test(path)) return ARTICLES.find((a) => a.id === "reuniao");
  return ARTICLES.find((a) => a.route === path);
}

// ── Você sabia? (tela Início) ───────────────────────────────────────────────

/** Uma dica de uso do Sales Coach por dia, na tela Início. */
export const HINTS: { text: string; route?: string; cta?: string; roles?: string[] }[] = [
  { text: "A extensão grava só o áudio por padrão: apresentar slides no Meet não deixa a chamada lenta.", route: "/extensao", cta: "Dicas da extensão" },
  { text: "Em Agendas → Minha agenda, você vê a sua semana com as reuniões gravadas e as que passaram sem gravação.", route: "/agendas?visao=agenda", cta: "Abrir Minha agenda" },
  { text: "O robô de reunião grava áudio e vídeo da chamada sem pesar no computador. Ligue o Robô automático em Minha agenda e ele entra sozinho nas reuniões com cliente.", route: "/agendas?visao=agenda", cta: "Abrir Minha agenda" },
  { text: "Pode usar fone: a voz do cliente vem direto da chamada, não da caixa de som.", route: "/extensao", cta: "Ver a extensão" },
  { text: "Antes de uma reunião difícil, treine com um cliente simulado no Modo de treino, por texto ou por voz.", route: "/treino", cta: "Começar um treino" },
  { text: "O Gerador de argumentos monta argumentos, ROI e respostas para objeções a partir do contexto do lead.", route: "/argumentos", cta: "Abrir o gerador" },
  { text: "Na análise, Compartilhar gera um link para quem não tem conta ver a reunião, com validade de 1 a 90 dias." },
  { text: "Se o envio da gravação falhar, o painel oferece Baixar a gravação: nada se perde." },
  { text: "Com a agenda conectada, a gravação já chega com o título, os participantes e o lead do convite.", route: "/agendas", cta: "Conectar a agenda" },
  { text: "O assistente do botão de ajuda responde sobre as suas reuniões: \"quais agendas ficaram mornas esta semana?\"" },
  { text: "Pela Visão geral, você acompanha a evolução dos scores e o ranking do time.", route: "/visao-geral", cta: "Abrir a Visão geral", roles: MGMT },
  { text: "Materiais novos na Base de conhecimento (propostas, cases, tabelas) deixam a análise e a dica do dia mais certeiras.", route: "/conhecimento", cta: "Abrir a base", roles: MGMT },
  { text: "Time de CS? Playbooks de atendimento avaliam as conversas por etapa, saúde do cliente e sinais de risco.", route: "/configuracoes", cta: "Ver os playbooks", roles: ["admin"] },
];
