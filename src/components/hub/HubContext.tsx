import { createContext, useContext } from "react";

export type HubTab = "inicio" | "jornada" | "ajuda" | "assistente";

export interface HubApi {
  /** Abre a central numa aba; em "ajuda", pode abrir direto um artigo. */
  openHub: (tab?: HubTab, articleId?: string) => void;
  /** Começa um tour guiado (ver TOURS em content.ts). */
  startTour: (tourId: string) => void;
}

export const HubContext = createContext<HubApi>({ openHub: () => {}, startTour: () => {} });

/** Abre a central ou um tour de qualquer tela (ex.: botão "Como funciona"). */
export const useHub = () => useContext(HubContext);
