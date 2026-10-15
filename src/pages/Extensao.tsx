import { ExternalLink, Pin, LogIn, MonitorPlay, Volume2, Lightbulb, Send, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STORE_URL = "https://chromewebstore.google.com/detail/icabeghcpefeaeklfldpdfklkjfpbbkd";

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
