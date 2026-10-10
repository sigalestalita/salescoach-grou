import { cn } from "@/lib/utils";
import { temperatureColor, temperatureLabels, useOrgConfig } from "@/hooks/useOrgConfig";

/**
 * Temperatura da oportunidade: ponto colorido + rótulo, sobre fundo neutro.
 * As faixas e os nomes vêm da configuração da organização.
 */
export function TemperatureBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  const { config } = useOrgConfig();
  if (!value) return null;
  const label = temperatureLabels(config.temperatureLevels)[value] ?? value;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-[12px] font-medium text-foreground",
        className,
      )}
    >
      <span className="status-dot" style={{ background: temperatureColor(value, config.temperatureLevels) }} />
      {label}
    </span>
  );
}

/** Situação de processamento com o mesmo desenho: ponto + rótulo. */
export function StatusBadge({ label, tone, className }: { label: string; tone: "ok" | "info" | "warn" | "bad" | "muted"; className?: string }) {
  const color = { ok: "var(--success)", info: "var(--info)", warn: "var(--warning)", bad: "var(--destructive)", muted: "var(--muted-foreground)" }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground",
        className,
      )}
    >
      <span className="status-dot" style={{ background: `hsl(${color})` }} />
      {label}
    </span>
  );
}
