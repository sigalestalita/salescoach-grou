import { Download, Chrome, Monitor, Mic, Upload, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const steps = [
  { icon: Download, title: "Baixe a extensão", desc: "Clique no botão abaixo para baixar o arquivo ZIP da extensão." },
  { icon: Chrome, title: "Abra chrome://extensions", desc: "No Chrome, digite chrome://extensions na barra de endereço e pressione Enter." },
  { icon: CheckCircle2, title: "Ative o Modo Desenvolvedor", desc: "No canto superior direito da página, ative o toggle 'Modo do desenvolvedor'." },
  { icon: Upload, title: "Carregue a extensão", desc: "Clique em 'Carregar sem compactação', selecione a pasta descompactada e confirme." },
];

export default function Extensao() {
  const handleDownload = () => {
    fetch("/sales-coach-extension.zip")
      .then((res) => {
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sales-coach-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert("Erro ao baixar: " + err.message));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Extensão Chrome</h1>
        <p className="text-muted-foreground mt-1">
          Grave suas reuniões com tela e áudio diretamente do navegador
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6 text-center">
            <Monitor className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold text-foreground">Gravação de Tela</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Capture a apresentação compartilhada durante a reunião
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6 text-center">
            <Mic className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold text-foreground">Áudio Completo</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Grava áudio do sistema + microfone automaticamente
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6 text-center">
            <Upload className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold text-foreground">Envio Automático</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Ao parar a gravação, o arquivo é enviado para análise automaticamente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Download */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Download className="h-5 w-5 text-primary" />
            Download da Extensão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDownload} size="lg" className="w-full md:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Baixar Extensão (.zip)
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Compatível com Chrome, Edge, Brave e outros navegadores Chromium.
          </p>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Como Instalar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    {i + 1}. {step.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Como Usar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>1. Clique no ícone da extensão na barra do Chrome</p>
          <p>2. Faça login com suas credenciais do Sales Coach</p>
          <p>3. Preencha o título da agenda e dados do lead</p>
          <p>4. Clique em <strong className="text-foreground">"Iniciar Gravação"</strong> e selecione a tela/aba</p>
          <p>5. Realize sua reunião normalmente</p>
          <p>6. Ao finalizar, clique em <strong className="text-foreground">"Parar e Enviar"</strong></p>
          <p>7. A gravação será enviada e analisada automaticamente 🎯</p>
        </CardContent>
      </Card>
    </div>
  );
}
