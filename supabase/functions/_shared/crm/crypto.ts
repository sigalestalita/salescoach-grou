// Criptografia dos tokens de CRM e assinatura do "state" do OAuth.
//
// Os tokens dão acesso ao CRM inteiro do cliente: ficam no banco só
// criptografados (AES-GCM), com a chave no segredo CRM_TOKEN_KEY, que nunca
// sai das edge functions. O "state" do OAuth carrega a organização de quem
// clicou em "Conectar" e é assinado, para que ninguém ligue o próprio CRM a
// outra empresa trocando o parâmetro.

const enc = new TextEncoder();
const dec = new TextDecoder();

function secret(): string {
  const s = Deno.env.get("CRM_TOKEN_KEY") ?? "";
  if (s.length < 32) throw new Error("CRM_TOKEN_KEY não configurada (mínimo de 32 caracteres).");
  return s;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function aesKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`tokens:${secret()}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function hmacKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`state:${secret()}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptToken(sealed: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Token em formato desconhecido.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(ct));
  return dec.decode(plain);
}

export interface OAuthState {
  orgId: string;
  userId: string;
  provider: string;
  /** Para onde voltar no app depois de conectar. */
  returnTo: string;
  issuedAt: number;
}

export async function signState(state: OAuthState): Promise<string> {
  const body = b64url(JSON.stringify(state));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64url(String.fromCharCode(...sig))}`;
}

/** Devolve o state se a assinatura confere e ele tem menos de `maxAgeMs`. */
export async function verifyState(token: string, maxAgeMs = 15 * 60 * 1000): Promise<OAuthState | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = Uint8Array.from(unb64url(sig), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), sigBytes, enc.encode(body));
  if (!ok) return null;
  try {
    const state = JSON.parse(unb64url(body)) as OAuthState;
    if (!state.orgId || !state.userId || Date.now() - state.issuedAt > maxAgeMs) return null;
    return state;
  } catch {
    return null;
  }
}
