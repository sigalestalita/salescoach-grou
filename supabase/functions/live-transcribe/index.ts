// Live transcription relay: browser <-> Edge Function <-> AssemblyAI Streaming v3
// Browser sends PCM16 16kHz mono frames over WS. We pipe to AssemblyAI,
// persist final turns to transcription_segments, and trigger live-coach.

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const meetingId = url.searchParams.get("meetingId");
  const token = url.searchParams.get("token");

  console.log("live-transcribe request", { meetingId: meetingId ? "present" : "missing" });

  if (!meetingId || !token) {
    return new Response("missing meetingId or token", { status: 400 });
  }

  // Validate JWT and meeting ownership
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return new Response("unauthorized", { status: 401 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: meeting } = await admin
    .from("meetings")
    .select("id, seller_id")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting || meeting.seller_id !== userData.user.id) {
    return new Response("forbidden", { status: 403 });
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("expected websocket", { status: 426 });
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);

  // Connect to AssemblyAI Streaming v3 using a temporary token in querystring.
  // speech_model is required by v3; u3-rt-pro supports PT and multilingual.
  const aaiBase =
    "wss://streaming.assemblyai.com/v3/ws" +
    "?speech_model=u3-rt-pro" +
    "&encoding=pcm_s16le" +
    "&sample_rate=16000";
  let aaiReady = false;
  const pendingFrames: ArrayBuffer[] = [];

  async function getTempToken(): Promise<string> {
    const r = await fetch(
      "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600",
      { headers: { Authorization: ASSEMBLY_KEY } },
    );
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`AssemblyAI token failed ${r.status}: ${t}`);
    }
    const j = await r.json();
    if (!j?.token) throw new Error("AssemblyAI token missing in response");
    return j.token;
  }

  let aai2: WebSocket | null = null;

  async function connectAssemblyAI() {
    const tempToken = await getTempToken();
    const url = `${aaiBase}&token=${encodeURIComponent(tempToken)}`;
    console.log("Opening AssemblyAI WS", aaiBase);
    aai2 = new WebSocket(url);
    aai2.binaryType = "arraybuffer";

    aai2.onopen = () => {
      console.log("AssemblyAI live websocket open");
      aaiReady = true;
      for (const f of pendingFrames) aai2?.send(f);
      pendingFrames.length = 0;
      try { client.send(JSON.stringify({ kind: "status", state: "transcribing" })); } catch {}
    };

    aai2.onerror = (e) => {
      console.error("AAI error", e);
      try { client.send(JSON.stringify({ kind: "error", message: "transcription_failed" })); } catch {}
    };

    aai2.onclose = (ev) => {
      console.log("AssemblyAI live websocket closed", ev.code, ev.reason);
      try { client.send(JSON.stringify({ kind: "error", message: `aai_closed:${ev.code}:${ev.reason || ""}` })); } catch {}
      try { client.close(); } catch {}
    };

    aai2.onmessage = handleAssemblyMessage;
  }

  let lastCoachAt = 0;
  const handleAssemblyMessage = async (ev: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data));
      // v3 events: Begin, Turn, Termination
      if (msg.type === "Turn") {
        const text: string = msg.transcript || "";
        const endOfTurn: boolean = !!msg.end_of_turn;
        // forward to browser overlay
        try { client.send(JSON.stringify({ kind: "turn", text, end_of_turn: endOfTurn })); } catch {}

        if (endOfTurn && text.trim().length > 2) {
          // persist final segment
          await admin.from("transcription_segments").insert({
            meeting_id: meetingId,
            text,
            is_final: true,
            speaker: "unknown",
          });
          // throttle coach: at most every 12s
          const now = Date.now();
          if (now - lastCoachAt > 12_000) {
            lastCoachAt = now;
            fetch(`${SUPABASE_URL}/functions/v1/live-coach`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_ROLE}`,
                apikey: ANON,
              },
              body: JSON.stringify({ meetingId }),
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("aai parse error", e);
    }
  };

  client.onopen = () => {
    console.log("client live websocket open");
    connectAssemblyAI().catch((e) => {
      console.error("AssemblyAI connect error", e);
      try { client.send(JSON.stringify({ kind: "error", message: "transcription_connect_failed" })); } catch {}
      try { client.close(); } catch {}
    });
  };

  client.onmessage = (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      if (aaiReady && aai2) aai2.send(ev.data);
      else pendingFrames.push(ev.data);
    } else if (typeof ev.data === "string") {
      // control msg from browser (e.g. terminate)
      try {
        const m = JSON.parse(ev.data);
        if (m.action === "terminate") {
          aai2?.send(JSON.stringify({ type: "Terminate" }));
        }
      } catch {}
    }
  };

  client.onclose = () => {
    try { aai2?.close(); } catch {}
  };

  return response;
});
