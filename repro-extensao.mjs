// Reproduz uma gravação real da extensão, do começo ao envio, para descobrir
// por que o AssemblyAI recusa o arquivo com "File type application/octet-stream
// (data) may be unsupported".
import { chromium } from "playwright";

const S = "/private/tmp/claude-501/-Users-talitasigales/f846daae-f7dd-4db8-b05f-a4df7580a2dc/scratchpad/";
const EXT = S + "ext-cap";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ";
const U = "https://xgpfuunmmjkgwjefofcd.supabase.co";

const auth = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { "Content-Type": "application/json", apikey: ANON },
  body: JSON.stringify({ email: "sigalestalita@gmail.com", password: "Grou@2026" }),
})).json();
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" };

const ctx = await chromium.launchPersistentContext(S + "chrome-repro", {
  headless: true, channel: "chromium",
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${S}audio/reuniao3.wav`,
    "--auto-select-desktop-capture-source=Entire screen", "--autoplay-policy=no-user-gesture-required"],
  viewport: { width: 1280, height: 800 }, locale: "pt-BR", permissions: ["microphone"],
});
const pg = ctx.pages()[0] || await ctx.newPage();
pg.on("console", (m) => { const t = m.text(); if (/erro|error|falh|upload/i.test(t)) console.log("  [página]", t.slice(0, 160)); });
await pg.goto("https://example.com", { waitUntil: "domcontentloaded" });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");

await sw.evaluate(async (tok) => {
  await chrome.storage.local.set({
    accessToken: tok.a, refreshToken: tok.r, userId: tok.u, userEmail: "sigalestalita@gmail.com",
    meetingData: { title: "TESTE — diagnóstico de transcodificação", meetingType: "apresentacao", leadName: "Teste", leadCompany: "Diagnóstico", leadEmail: "" },
  });
  const tabs = await chrome.tabs.query({}); const tab = tabs.find((t) => t.active) || tabs[0];
  await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  await new Promise((r) => setTimeout(r, 800));
  await chrome.tabs.sendMessage(tab.id, { action: "startRecording" });
}, { a: auth.access_token, r: auth.refresh_token, u: auth.user.id });

console.log("gravando 30 s…");
await pg.waitForTimeout(30000);

// Para e envia, como o botão "Parar e enviar" faz.
await pg.evaluate(() => document.getElementById("sc-btn-stop")?.click());
console.log("parou; aguardando o envio…");
for (let i = 0; i < 20; i++) {
  await pg.waitForTimeout(3000);
  const txt = await pg.evaluate(() => document.getElementById("salescoach-overlay")?.innerText ?? "");
  if (/enviada|erro|❌/i.test(txt)) { console.log("overlay:", txt.replace(/\n/g, " | ").slice(0, 200)); break; }
}
await ctx.close();

// O que chegou no banco
await new Promise((r) => setTimeout(r, 4000));
const ms = await (await fetch(`${U}/rest/v1/meetings?select=id,title,status,file_url,file_type,error_message,created_at&order=created_at.desc&limit=2`, { headers: H })).json();
for (const m of ms) console.log(`\nreunião ${m.id}\n  título ${m.title}\n  status ${m.status}\n  arquivo ${m.file_url} (${m.file_type})\n  erro ${m.error_message ?? "—"}`);
console.log("\nMEETING=" + ms[0]?.id + " FILE=" + ms[0]?.file_url);
