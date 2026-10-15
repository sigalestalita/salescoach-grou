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
    title: "Entre com a sua conta",
    desc: "Clique no ícone do Sales Coach e entre com o mesmo e-mail e senha que você usa aqui. Só precisa fazer isso uma vez.",
  },
  {
    icon: MonitorPlay,
    title: "Na reunião, inicie a gravação",
    desc: (
      <>
        Com a reunião aberta no Google Meet ou no Teams, clique no ícone, preencha o título e os dados do lead e clique em{" "}
        <strong className="text-foreground">Iniciar gravação</strong>.
      </>
    ),
  },
  {
    icon: Volume2,
    title: "Escolha a aba da reunião, com áudio",
    desc: (
      <>
        O Chrome pergunta o que compartilhar. Escolha <strong className="text-foreground">Guia do Chrome</strong>, selecione a
        aba da reunião e deixe ligado <strong className="text-foreground">Compartilhar áudio da guia</strong>. Sem o áudio,
        só a sua voz é gravada. Se pedir o microfone, clique em Permitir.
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
    title: "Ao terminar, clique em Parar e enviar",
    desc: "A gravação vai para o Sales Coach e a análise fica pronta em alguns minutos na página Agendas.",
  },
];

const tips = [
  "Avise o cliente no início da reunião que ela está sendo gravada.",
  "Não feche a aba da reunião antes de o painel mostrar \"Gravação enviada\".",
  "Se o envio falhar, o painel oferece o botão \"Baixar a gravação\". Guarde o arquivo e envie depois em Agendas, no botão Nova Agenda.",
  "Se o painel disser que a sessão expirou, clique no ícone, em Sair da conta, e entre de novo.",
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
          <Button asChild size="lg" className="w-full md:w-auto">
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Instalar no Chrome
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
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
