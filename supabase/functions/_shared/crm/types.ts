// Contrato comum dos conectores de CRM.
//
// O núcleo (fila, mapeamento, histórico) só conversa com esta interface. Cada
// CRM novo (HubSpot, Pipedrive, Kommo) é um arquivo que a implementa.

export type CrmProvider = "rdstation" | "hubspot" | "pipedrive" | "kommo";

export interface CrmField {
  /** Chave usada para gravar o valor (slug, id ou hash, conforme o CRM). */
  key: string;
  label: string;
  /** Tipo como o CRM informa (text, number, date, option, multiple_choice, hyperlink...). */
  type: string;
  options: string[] | null;
}

export interface CrmDeal {
  id: string;
  name: string;
  status?: string | null;
  /** Valores atuais dos campos personalizados, pela mesma chave de CrmField.key. */
  fields: Record<string, unknown>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** ISO 8601 */
  expiresAt: string | null;
  /** Base da API da conta, quando o CRM tem uma por cliente (Pipedrive). */
  apiDomain?: string | null;
}

export type CrmErrorKind = "auth" | "rate" | "not_found" | "invalid" | "server";

/** Erro de CRM com o tipo que decide se a fila tenta de novo. */
export class CrmError extends Error {
  constructor(message: string, public kind: CrmErrorKind, public retryAfterSeconds?: number) {
    super(message);
  }
}

export interface CrmConnector {
  provider: CrmProvider;
  listDealFields(): Promise<CrmField[]>;
  createDealField(label: string, type: "number" | "text" | "date" | "option" | "hyperlink", options?: string[]): Promise<CrmField>;
  /** Negócios ligados ao contato com este e-mail (abertos primeiro). */
  dealsForEmail(email: string): Promise<CrmDeal[]>;
  searchDeals(term: string): Promise<CrmDeal[]>;
  /** `fieldKeys`: campos cujo valor atual é preciso ler (regra "só se vazio"). */
  getDeal(id: string, fieldKeys?: string[]): Promise<CrmDeal>;
  updateDealFields(id: string, fields: Record<string, string | number>): Promise<void>;
  createNote(dealId: string, text: string): Promise<void>;
  createTask(dealId: string, task: { name: string; description: string; dueDate: string }): Promise<void>;
}

export interface CrmOAuth {
  authorizeUrl(state: string, redirectUri: string): string;
  /** `callback`: parâmetros da volta do OAuth (o Kommo manda o endereço da conta neles). */
  exchangeCode(code: string, redirectUri: string, callback?: URLSearchParams): Promise<TokenSet>;
  /** `ctx`: endereço da conta e URL de retorno, para CRMs que pedem os dois na renovação. */
  refresh(refreshToken: string, ctx?: { apiDomain?: string | null; redirectUri?: string }): Promise<TokenSet>;
}
