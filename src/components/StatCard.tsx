import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cartão de indicador.
 *
 * Superfície branca e número em destaque; o tom é só um ponto ao lado do
 * rótulo, para diferenciar métricas lado a lado sem pintar o cartão inteiro.
 * `navy` e `blue` seguem a cor da marca da organização; teal para
 * pessoas/atividade, coral para calor/urgência, amber para atenção, sky para
 * frio, slate para neutro.
 */
export type StatTone = "navy" | "blue" | "teal" | "coral" | "amber" | "sky" | "slate";

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
  children?: ReactNode;
}

export function StatCard({ label, value, hint, icon: Icon, tone = "navy", className, children }: StatCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-card", `tone-${tone}`, className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
          <span className="status-dot" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </div>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" strokeWidth={1.5} />}
      </div>
      <div className="metric mt-4 text-[30px] leading-none">{value}</div>
      {hint && <div className="mt-2 text-[12.5px] text-muted-foreground">{hint}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
