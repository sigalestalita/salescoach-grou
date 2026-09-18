import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cartão de indicador com fundo colorido e dado em branco.
 *
 * `navy` e `blue` usam a cor da marca (seguem a identidade da organização);
 * os demais tons são fixos e servem para diferenciar métricas lado a lado:
 * teal para pessoas/atividade, coral para calor/urgência, amber para atenção,
 * sky para frio, slate para neutro.
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
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] p-5 text-white shadow-[0_14px_34px_-18px_hsl(var(--brand-navy)/0.45)] transition-transform duration-200 hover:-translate-y-0.5",
        `tone-${tone}`,
        className,
      )}
    >
      {/* brilho suave no canto, sem virar fundo genérico */}
      <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="text-[13.5px] font-medium text-white/85">{label}</div>
        {Icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className="relative mt-3 text-[34px] font-bold leading-none tracking-tight tabular-nums">{value}</div>
      {hint && <div className="relative mt-2 text-xs text-white/75">{hint}</div>}
      {children && <div className="relative mt-3">{children}</div>}
    </div>
  );
}
