import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const B = ({ children }: { children: React.ReactNode }) => <strong className="text-foreground">{children}</strong>;

/**
 * Passo a passo para conectar o Google Agenda, junto do botão Conectar.
 * Enquanto o Google não termina a verificação do app, a autorização mostra o
 * aviso "O Google não verificou este app": sem o passo a passo, a pessoa acha
 * que é golpe e desiste. Depois da verificação, tire o passo 3, o primeiro
 * problema e o resumo de GoogleCalendarGuide.
 */
const steps: { title: string; body: React.ReactNode }[] = [
  {
    title: "Clique em Conectar Google Agenda",
    body: <>Aqui mesmo, no quadro Sua agenda.</>,
  },
  {
    title: "Escolha a sua conta do trabalho",
    body: <>A mesma conta do Google em que ficam as suas reuniões com clientes.</>,
  },
  {
    title: "Passe pelo aviso do Google",
    body: (
      <>
        Se aparecer <B>O Google não verificou este app</B>, não clique no botão azul. Clique em <B>Avançado</B>, no canto
        inferior esquerdo, e depois em <B>Acessar Sales Coach (não seguro)</B>. O aviso aparece enquanto o Google conclui a
        verificação do Sales Coach. O acesso é só de leitura: o Sales Coach não cria, não altera e não apaga eventos.
      </>
    ),
  },
  {
    title: "Marque a permissão da agenda",
    body: (
      <>
        Na tela <B>O Sales Coach quer acessar sua Conta do Google</B>, marque a caixa <B>Ver eventos em todas as suas
        agendas</B> (ou <B>Selecionar tudo</B>) e clique em <B>Continuar</B>. Sem essa caixa marcada, a agenda não conecta.
      </>
    ),
  },
  {
    title: "Pronto",
    body: (
      <>
        Você volta para esta página com a mensagem <B>Agenda conectada</B>. As próximas gravações já chegam com o título, os
        participantes e o lead.
      </>
    ),
  },
];

const problems: { q: string; a: React.ReactNode }[] = [
  {
    q: "Apareceu \"Acesso bloqueado\" ou não tem a opção Avançado",
    a: (
      <>
        A sua empresa usa Google Workspace e bloqueia apps que ainda não foram verificados. Peça ao administrador do Google
        Workspace para liberar: em <B>admin.google.com</B> → <B>Segurança</B> → <B>Acesso e controle de dados</B> →{" "}
        <B>Controles de API</B> → <B>Gerenciar acesso de apps de terceiros</B> → <B>Configurar novo app</B>, procurar{" "}
        <B>Sales Coach</B> (ou o ID do app, que o nosso suporte envia) e marcar como <B>Confiável</B>. Depois, conecte de novo.
      </>
    ),
  },
  {
    q: "Conectou, mas aparece Reconectar ou a gravação não pega o título",
    a: (
      <>
        Provavelmente a caixa da agenda ficou desmarcada, ou o acesso expirou. Clique em <B>Reconectar Google Agenda</B> e,
        na tela de permissões, marque <B>Ver eventos em todas as suas agendas</B>.
      </>
    ),
  },
  {
    q: "Usa o Outlook?",
    a: (
      <>
        Clique em <B>Conectar Outlook</B> e entre com a conta da Microsoft do trabalho. Se aparecer{" "}
        <B>Precisa de aprovação do administrador</B>, o administrador do Microsoft 365 da empresa precisa aprovar o Sales
        Coach uma vez.
      </>
    ),
  },
];

export function GoogleCalendarGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="w-full space-y-3 border-t border-border pt-3" data-tour="agenda-passo-a-passo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          O Google avisou que <B>não verificou este app</B>? Clique em <B>Avançado</B> → <B>Acessar Sales Coach</B> e marque a
          caixa da agenda.
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {open ? "Esconder o passo a passo" : "Ver o passo a passo"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <div className="mt-0.5 text-sm text-muted-foreground">{step.body}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="space-y-3 self-start rounded-lg bg-muted/50 p-4">
            <h3 className="text-sm font-semibold text-foreground">Se algo der errado</h3>
            <dl className="space-y-3 text-sm">
              {problems.map((p) => (
                <div key={p.q}>
                  <dt className="font-medium text-foreground">{p.q}</dt>
                  <dd className="mt-0.5 text-muted-foreground">{p.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
