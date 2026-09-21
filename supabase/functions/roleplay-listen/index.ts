// Transcrição ao vivo da fala do vendedor no modo de treino.
//
// Antes, o turno era gravado inteiro, subido em base64 e transcrito em lote
// pelo AssemblyAI (upload + fila + polling): 5 a 7 segundos de silêncio
// depois que a pessoa parava de falar. Aqui o áudio sobe enquanto ela fala,
// pelo mesmo streaming v3 que as reuniões já usam, e o texto fica pronto no
// instante em que ela solta o botão.
//
// O navegador abre o WebSocket, manda PCM16 16 kHz mono e, no fim, um
// {"action":"stop"}. A função devolve {kind:"final", text} com a fala inteira.

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const token = url.searchParams.get("token");

  if (!sessionId || !token) return new Response("missing sessionId or token", { status: 400 });
  if (!ASSEMBLY_KEY) return new Response("ASSEMBLYAI_API_KEY ausente", { status: 500 });

  // O treino tem de ser de quem está chamando e estar em andamento.
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return new Response("unauthorized", { status: 401 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: session } = await admin
    .from("roleplay_sessions")
    .select("id, user_id, org_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.user_id !== userData.user.id) return new Response("forbidden", { status: 403 });
  if (session.status !== "em_andamento") return new Response("sessão encerrada", { status: 400 });

  if (req.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });

  const { socket: client, response } = Deno.upgradeWebSocket(req);

  const aaiBase =
    "wss://streaming.assemblyai.com/v3/ws" +
    "?speech_model=u3-rt-pro" +
    "&encoding=pcm_s16le" +
    "&sample_rate=16000";

  let aai: WebSocket | null = null;
  let aaiReady = false;
  const pendentes: ArrayBuffer[] = [];
  // Texto dos turnos já fechados; o turno em andamento fica à parte para não
  // duplicar quando o AssemblyAI reescreve a frase.
  const fechados: string[] = [];
  let emAndamento = "";
  let encerrando = false;

  const textoAtual = () => [...fechados, emAndamento].map((t) => t.trim()).filter(Boolean).join(" ").trim();

  function enviaFinal() {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(JSON.stringify({ kind: "final", text: textoAtual() })); } catch { /* já fechou */ }
    }
    try { aai?.close(); } catch { /* ignore */ }
    try { client.close(); } catch { /* ignore */ }
  }

  async function tokenTemporario(): Promise<string> {
    const r = await fetch("https://streaming.assemblyai.com/v3/token?expires_in_seconds=600", {
      headers: { Authorization: ASSEMBLY_KEY },
    });
    if (!r.ok) throw new Error(`AssemblyAI token falhou ${r.status}: ${await r.text()}`);
    const j = await r.json();
    if (!j?.token) throw new Error("AssemblyAI não devolveu token");
    return j.token;
  }

  async function conecta() {
    const temp = await tokenTemporario();
    aai = new WebSocket(`${aaiBase}&token=${encodeURIComponent(temp)}`);
    aai.binaryType = "arraybuffer";

    aai.onopen = () => {
      aaiReady = true;
      for (const f of pendentes) aai?.send(f);
      pendentes.length = 0;
      try { client.send(JSON.stringify({ kind: "status", state: "ouvindo" })); } catch { /* ignore */ }
    };

    aai.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data));
        if (msg.type === "Turn") {
          const texto: string = msg.transcript || "";
          if (msg.end_of_turn) {
            if (texto.trim()) fechados.push(texto);
            emAndamento = "";
          } else {
            emAndamento = texto;
          }
          try { client.send(JSON.stringify({ kind: "parcial", text: textoAtual() })); } catch { /* ignore */ }
          if (encerrando && msg.end_of_turn) enviaFinal();
        }
        if (msg.type === "Termination") enviaFinal();
      } catch { /* mensagem que não é JSON: ignora */ }
    };

    aai.onerror = () => {
      try { client.send(JSON.stringify({ kind: "error", message: "transcricao_falhou" })); } catch { /* ignore */ }
    };

    aai.onclose = () => {
      if (!encerrando) {
        try { client.send(JSON.stringify({ kind: "error", message: "transcricao_encerrada" })); } catch { /* ignore */ }
      }
      try { client.close(); } catch { /* ignore */ }
    };
  }

  client.onopen = () => {
    conecta().catch((e) => {
      console.error("roleplay-listen: falha ao abrir o AssemblyAI", e);
      try { client.send(JSON.stringify({ kind: "error", message: "transcricao_indisponivel" })); } catch { /* ignore */ }
      try { client.close(); } catch { /* ignore */ }
    });
  };

  client.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      let msg: Record<string, unknown> = {};
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.action === "stop") {
        encerrando = true;
        // Pede o fechamento do turno e, se ele não vier rápido, devolve o que já tem.
        try { aai?.send(JSON.stringify({ type: "Terminate" })); } catch { /* ignore */ }
        setTimeout(() => { if (client.readyState === WebSocket.OPEN) enviaFinal(); }, 1200);
      }
      return;
    }
    const frame = ev.data as ArrayBuffer;
    if (!aaiReady || !aai || aai.readyState !== WebSocket.OPEN) {
      if (pendentes.length < 200) pendentes.push(frame);
      return;
    }
    try { aai.send(frame); } catch { /* ignore */ }
  };

  const inicio = Date.now();
  client.onclose = () => {
    try { aai?.close(); } catch { /* ignore */ }
    const minutos = Math.max(0.1, Math.round(((Date.now() - inicio) / 60000) * 100) / 100);
    admin.from("api_usage_logs").insert({
      org_id: session.org_id,
      user_id: userData.user!.id,
      operation_type: "transcricao",
      model_used: "u3-rt-pro",
      provider: "assemblyai",
      quantity: minutos,
      unit: "minutos",
    }).then(({ error }) => { if (error) console.error("roleplay-listen: consumo não registrado:", error.message); });
  };

  return response;
});
