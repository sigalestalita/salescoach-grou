import { useState } from "react";
import {
  ExternalLink, Pin, LogIn, MonitorPlay, Volume2, Lightbulb, Send, AlertCircle, Download, ChevronDown, Copy, Check,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STORE_URL = "https://chromewebstore.google.com/detail/icabeghcpefeaeklfldpdfklkjfpbbkd";

/**
 * Instalação manual: a versão mais nova da extensão enquanto a Chrome Web Store
 * analisa a atualização. O arquivo é gerado por scripts/extensao-manual.sh e
 * leva a chave pública da extensão publicada, para ficar com o mesmo id da
 * loja (o login automático pelo site depende disso). Ao publicar uma versão
 * nova: rode o script e atualize MANUAL_VERSION. Quando a loja estiver em dia,
 * MANUAL_VERSION = null esconde a seção.
 */
const MANUAL_VERSION: string | null = "1.10.1";
const MANUAL_URL = MANUAL_VERSION ? `/downloads/sales-coach-extensao-${MANUAL_VERSION}.zip` : "";
const EXTENSIONS_PAGE = "chrome://extensions";

const steps = [
  {
    icon: ExternalLink,
    title: "Instale pela Chrome Web Store",
    desc: (
      <>
        Clique em <strong className="text-foreground">Instalar no Chrome</strong>, logo acima, e depois em{" "}
        <strong className="text-foreground">Usar no Chrome</strong>. Funciona também no Edge e no Brave.
      </>
    ),
  },
  {
    icon: Pin,
    title: "Fixe o ícone na barra",
    desc: (
      <>
        Clique no ícone de quebra-cabeça, no canto superior direito do Chrome, e no alfinete ao lado de{" "}
        <strong className="text-foreground">Sales Coach</strong>. Assim ele fica sempre à mão.
      </>
    ),
  },
  {
    icon: LogIn,
    title: "A extensão entra sozinha",
    desc: (
      <>
        Com o Sales Coach aberto e logado neste navegador, a extensão se conecta à sua conta automaticamente. Se ela pedir
        login, clique no ícone e em <strong className="text-foreground">Entrar pelo Sales Coach</strong>.
      </>
    ),
  },
  {
    icon: MonitorPlay,
    title: "Entre na reunião e clique em Gravar",
    desc: (
      <>
        Ao entrar numa chamada do Google Meet ou do Teams, aparece o cartão{" "}
        <strong className="text-foreground">Gravar esta reunião?</strong>. Não precisa preencher nada: com a agenda
        conectada, o título e o lead vêm do convite. Se clicar em Agora não, ele lembra de novo em 2 minutos.
      </>
    ),
  },
  {
    icon: Volume2,
    title: "Confirme no Chrome",
    desc: (
      <>
        O Chrome pede para compartilhar a aba da reunião. Deixe ligado{" "}
        <strong className="text-foreground">Compartilhar áudio da guia</strong> e clique em{" "}
        <strong className="text-foreground">Compartilhar</strong>. Na primeira vez, permita também o microfone.
      </>
    ),
  },
  {
    icon: Lightbulb,
    title: "Conduza a reunião",
    desc: "Um painel no canto da tela mostra a transcrição e dicas ao vivo. Ele pode ser minimizado e só você o vê; os outros participantes não.",
  },
  {
    icon: Send,
    title: "Saia da chamada: a gravação é enviada sozinha",
    desc: "A análise fica pronta em alguns minutos na página Agendas, com o nome e a empresa do lead identificados pela conversa. Confira e corrija ali, se precisar.",
  },
];

const tips = [
  "Conecte sua agenda (Google ou Outlook) na página Agendas: as gravações já vêm com o título, os participantes e o lead.",
  "Avise o cliente no início da reunião que ela está sendo gravada.",
  "Não feche a aba da reunião antes de o painel mostrar \"Gravação enviada\".",
  "Quer preencher os dados do lead antes? Clique no ícone da extensão e use Iniciar gravação.",
  "Se o envio falhar, o painel oferece o botão \"Baixar a gravação\". Guarde o arquivo e envie depois em Agendas, no botão Nova Agenda.",
  "Para não ver mais o cartão nas reuniões, clique no ícone da extensão e desmarque a opção de oferecer gravação.",
];

const B = ({ children }: { children: React.ReactNode }) => <strong className="text-foreground">{children}</strong>;

function CopyAddress() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EXTENSIONS_PAGE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* o endereço continua visível para copiar à mão */ }
  };
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <code className="select-all rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground">{EXTENSIONS_PAGE}</code>
      <Button type="button" variant="outline" size="sm" className="h-7" onClick={copy}>
        {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
        {copied ? "Copiado" : "Copiar endereço"}
      </Button>
    </span>
  );
}

const manualSteps: { title: string; body: React.ReactNode }[] = [
  {
    title: "Baixe o arquivo da extensão",
    body: (
      <>
        Clique em <B>Baixar extensão</B>, acima. O Chrome salva o arquivo <B>sales-coach-extensao-{MANUAL_VERSION}.zip</B> na
        pasta Downloads.
      </>
    ),
  },
  {
    title: "Descompacte o arquivo",
    body: (
      <>
        <span className="block"><B>Windows:</B> abra a pasta Downloads, clique com o botão direito no arquivo e escolha <B>Extrair tudo…</B> e depois <B>Extrair</B>.</span>
        <span className="block"><B>Mac:</B> dê dois cliques no arquivo.</span>
        <span className="mt-1 block">
          Aparece uma pasta chamada <B>sales-coach-extensao</B>. Mova essa pasta para um lugar fixo, como Documentos, e não a
          apague depois: o Chrome usa os arquivos dela enquanto a extensão estiver instalada.
        </span>
      </>
    ),
  },
  {
    title: "Abra a página de extensões do Chrome",
    body: (
      <>
        Copie o endereço abaixo, cole na barra de endereço do Chrome (onde fica o endereço dos sites) e aperte Enter. Por
        segurança, o Chrome não deixa abrir essa página por um link.
        <CopyAddress />
      </>
    ),
  },
  {
    title: "Se já tiver o Sales Coach instalado, remova",
    body: (
      <>
        Se aparecer um cartão <B>Sales Coach</B> na lista, clique em <B>Remover</B> e confirme. As duas versões não funcionam
        juntas. Sua conta e suas gravações não são afetadas: ficam no Sales Coach, não na extensão.
      </>
    ),
  },
  {
    title: "Ligue o Modo do desenvolvedor",
    body: (
      <>
        No canto superior direito da página, ative a chave <B>Modo do desenvolvedor</B>. Aparece uma barra com três botões
        logo abaixo do título.
      </>
    ),
  },
  {
    title: "Carregue a pasta da extensão",
    body: (
      <>
        Clique em <B>Carregar sem compactação</B> (o primeiro botão, à esquerda) e escolha a pasta <B>sales-coach-extensao</B>{" "}
        que você descompactou. Selecione a pasta, não o arquivo .zip, e clique em <B>Selecionar pasta</B>.
      </>
    ),
  },
  {
    title: "Confira e fixe o ícone",
    body: (
      <>
        Deve aparecer o cartão <B>Sales Coach — Gravador e Coach ao Vivo</B>, versão <B>{MANUAL_VERSION}</B>, com a chave
        ligada. Depois clique no ícone de quebra-cabeça, no alto do Chrome, e no alfinete ao lado de Sales Coach.
      </>
    ),
  },
  {
    title: "Volte para esta página",
    body: (
      <>
        Recarregue esta página do Sales Coach. A extensão se conecta à sua conta sozinha. Pronto: o uso nas reuniões é igual
        ao do passo a passo abaixo.
      </>
    ),
  },
];

const manualProblems: { q: string; a: React.ReactNode }[] = [
  {
    q: "Apareceu \"Falha ao carregar extensão\" ou \"Arquivo de manifesto ausente\"",
    a: (
      <>
        A pasta escolhida não é a certa. Às vezes o Windows cria uma pasta dentro da outra com o mesmo nome. Abra a pasta e
        escolha a que tem o arquivo <B>manifest.json</B> dentro.
      </>
    ),
  },
  {
    q: "O Chrome mostra o aviso \"Desativar extensões no modo de desenvolvedor\"",
    a: (
      <>
        É normal em instalação manual. Feche o aviso no X (ou clique em Cancelar) e não desative a extensão.
      </>
    ),
  },
  {
    q: "A extensão pede login",
    a: (
      <>
        Abra o Sales Coach neste mesmo Chrome, já logado, e recarregue a página. Se continuar, clique no ícone da extensão e em{" "}
        <B>Entrar pelo Sales Coach</B>.
      </>
    ),
  },
  {
    q: "Quando a versão nova chegar na Chrome Web Store",
    a: (
      <>
        A instalação manual não se atualiza sozinha. Quando avisarmos que a loja está em dia, remova esta versão em{" "}
        <B>{EXTENSIONS_PAGE}</B>, instale pelo botão <B>Instalar no Chrome</B> e desligue o Modo do desenvolvedor. A pasta
        descompactada pode ser apagada depois disso.
      </>
    ),
  },
];

function ManualInstall() {
  const [open, setOpen] = useState(false);
  if (!MANUAL_VERSION) return null;
  return (
    <Card className="border-border bg-card" data-tour="ext-manual">
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between md:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex flex-wrap items-center gap-2 text-foreground">
            <Wrench className="h-5 w-5 text-primary" />
            Versão mais nova, sem a loja
            <Badge variant="secondary">{MANUAL_VERSION}</Badge>
          </CardTitle>
          <CardDescription className="max-w-2xl">
            A versão {MANUAL_VERSION} está em análise na Chrome Web Store. Ela traz o painel novo na reunião e não perde a
            gravação se a aba for fechada. Se quiser usá-la agora, instale à mão. Leva uns 3 minutos.
          </CardDescription>
        </div>
        <Button asChild variant="outline" className="w-full shrink-0 md:w-auto">
          <a href={MANUAL_URL} download>
            <Download className="mr-2 h-4 w-4" />
            Baixar extensão
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50"
        >
          Passo a passo da instalação manual
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="space-y-6">
            <ol className="space-y-5">
              {manualSteps.map((step, i) => (
                <li key={step.title} className="flex items-start gap-4">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{step.title}</h3>
                    <div className="mt-0.5 text-sm text-muted-foreground">{step.body}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="space-y-3 rounded-lg bg-muted/50 p-4">
              <h3 className="font-semibold text-foreground">Se algo der errado</h3>
              <dl className="space-y-3 text-sm">
                {manualProblems.map((p) => (
                  <div key={p.q}>
                    <dt className="font-medium text-foreground">{p.q}</dt>
                    <dd className="mt-0.5 text-muted-foreground">{p.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Extensao() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Extensão do Chrome</h1>
        <p className="text-muted-foreground mt-1">
          Grave suas reuniões no Google Meet e no Teams e receba dicas ao vivo, direto no navegador.
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Instale em um clique</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A extensão está na Chrome Web Store e se atualiza sozinha.
            </p>
          </div>
          <Button asChild size="lg" className="w-full md:w-auto" data-tour="ext-instalar">
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Instalar no Chrome
            </a>
          </Button>
        </CardContent>
      </Card>

      <ManualInstall />

      <Card className="bg-card border-border" data-tour="ext-passos">
        <CardHeader>
          <CardTitle className="text-foreground">Passo a passo</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-6">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {i + 1}. {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <AlertCircle className="h-5 w-5 text-primary" />
            Boas práticas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {tips.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
