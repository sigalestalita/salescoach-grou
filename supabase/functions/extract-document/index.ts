import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──

function isGoogleSheetsUrl(url: string): boolean {
  return url.includes("docs.google.com/spreadsheets");
}

function getGoogleSheetsCsvUrl(url: string): string {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Invalid Google Sheets URL");
  const sheetId = match[1];
  // Extract gid if present
  const gidMatch = url.match(/gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

async function extractFromUrl(url: string, lovableKey: string): Promise<string> {
  // Google Sheets → try CSV export first, fallback to HTML scraping
  if (isGoogleSheetsUrl(url)) {
    console.log("Extracting Google Sheets as CSV...");
    const csvUrl = getGoogleSheetsCsvUrl(url);
    const res = await fetch(csvUrl, { redirect: "follow" });
    if (res.ok) {
      const csvText = await res.text();
      return await summarizeWithAI(
        `Este é o conteúdo de uma planilha Google Sheets exportada como CSV:\n\n${csvText.substring(0, 15000)}`,
        lovableKey
      );
    }
    // CSV export failed (sheet not public) → fall back to HTML scraping
    console.log(`CSV export failed (${res.status}), falling back to HTML scraping...`);
    const htmlRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LovableBot/1.0)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });
    if (!htmlRes.ok) {
      throw new Error(`Failed to fetch Google Sheet page: ${htmlRes.status}`);
    }
    const html = await htmlRes.text();
    const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return await summarizeWithAI(
      `Este é o conteúdo extraído de uma planilha Google Sheets (HTML):\n\n${textContent.substring(0, 15000)}`,
      lovableKey
    );
  }

  // Regular website → fetch HTML and extract with AI
  console.log("Fetching website content:", url);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LovableBot/1.0)",
      Accept: "text/html,application/xhtml+xml,text/plain,*/*",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();

  // If it's plain text or CSV
  if (contentType.includes("text/plain") || contentType.includes("text/csv")) {
    return await summarizeWithAI(
      `Este é o conteúdo de um arquivo texto/CSV:\n\n${body.substring(0, 15000)}`,
      lovableKey
    );
  }

  // HTML → strip tags roughly for context, then use AI
  const strippedHtml = body
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return await summarizeWithAI(
    `Este é o conteúdo extraído de um site (${url}):\n\n${strippedHtml.substring(0, 15000)}`,
    lovableKey
  );
}

async function summarizeWithAI(content: string, lovableKey: string): Promise<string> {
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você é um extrator de conteúdo. Extraia e organize TODO o conteúdo relevante do texto fornecido. Mantenha dados, números, nomes de produtos, preços, características e qualquer informação comercialmente útil. Estruture em seções claras. Retorne APENAS o conteúdo extraído e organizado.",
        },
        {
          role: "user",
          content,
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    const err = await aiRes.text();
    throw new Error(`AI extraction failed: ${err}`);
  }

  const result = await aiRes.json();
  return result.choices?.[0]?.message?.content || "";
}

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 32768;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(""));
}

const MAX_BINARY_AI_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PDF_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

async function extractTextFromPdf(fileData: Blob): Promise<string> {
  const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@1.4.0");
  const arrayBuffer = await fileData.arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));

  try {
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const normalizedText = (Array.isArray(text) ? text.join("\n\n") : text)
      .replace(/\u0000/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    console.log(`Extracted text from PDF (${totalPages} pages, ${normalizedText.length} chars)`);
    return normalizedText;
  } finally {
    if (typeof pdf.destroy === "function") {
      await pdf.destroy();
    }
  }
}

async function extractFromFile(
  fileData: Blob,
  fileName: string,
  lovableKey: string
): Promise<string> {
  const lowerName = fileName.toLowerCase();

  // Plain text / CSV → read directly
  if (lowerName.endsWith(".txt") || lowerName.endsWith(".csv")) {
    const text = await fileData.text();
    if (lowerName.endsWith(".csv")) {
      return await summarizeWithAI(
        `Este é o conteúdo de uma planilha CSV:\n\n${text.substring(0, 15000)}`,
        lovableKey
      );
    }
    return text;
  }

  // PDF → extract text directly to avoid large base64 payloads
  if (lowerName.endsWith(".pdf")) {
    if (fileData.size > MAX_PDF_FILE_SIZE) {
      throw new Error(`PDF muito grande (${Math.round(fileData.size / 1024 / 1024)}MB). Limite: 50MB.`);
    }

    try {
      const pdfText = await extractTextFromPdf(fileData);
      if (pdfText.length >= 100) {
        return pdfText;
      }
      console.warn("PDF extraction returned little/no text, trying AI fallback...");
    } catch (error) {
      console.warn("PDF text extraction failed, trying AI fallback:", error);
    }

    if (fileData.size > MAX_BINARY_AI_FILE_SIZE) {
      throw new Error(
        `Não foi possível extrair automaticamente este PDF de ${Math.round(fileData.size / 1024 / 1024)}MB. ` +
        "Se ele for escaneado ou composto por imagens, divida em partes menores ou envie uma versão com texto pesquisável."
      );
    }
  }

  // DOC, DOCX, XLS, XLSX and PDF fallback → send to AI as base64
  if (fileData.size > MAX_BINARY_AI_FILE_SIZE) {
    throw new Error(`Arquivo muito grande (${Math.round(fileData.size / 1024 / 1024)}MB). Limite: 10MB.`);
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const base64 = uint8ToBase64(uint8Array);

  let mimeType = "application/octet-stream";
  if (lowerName.endsWith(".pdf")) mimeType = "application/pdf";
  else if (lowerName.endsWith(".docx"))
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  else if (lowerName.endsWith(".doc")) mimeType = "application/msword";
  else if (lowerName.endsWith(".xlsx"))
    mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  else if (lowerName.endsWith(".xls")) mimeType = "application/vnd.ms-excel";

  console.log(`Extracting from file: ${fileName} (${mimeType}, ${Math.round(uint8Array.length / 1024)}KB)`);

  const prompt = lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")
    ? "Extraia TODO o conteúdo desta planilha. Liste todas as abas, colunas, dados, valores e fórmulas visíveis. Organize os dados em formato tabular legível. Retorne apenas o conteúdo extraído."
    : "Extraia todo o conteúdo textual deste documento. Mantenha a estrutura original (títulos, subtítulos, listas, tabelas). Retorne apenas o conteúdo extraído.";

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você é um extrator de conteúdo especializado. Extraia TODO o conteúdo do documento enviado de forma estruturada e completa.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`AI extraction failed: ${errText}`);
  }

  const result = await aiRes.json();
  return result.choices?.[0]?.message?.content || "";
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();
    if (!documentId) {
      return new Response(JSON.stringify({ error: "documentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: doc, error: docError } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip if already extracted
    if (doc.extracted_content && doc.extracted_content.trim().length > 0) {
      return new Response(JSON.stringify({ success: true, message: "Already extracted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extractedText = "";

    if (doc.doc_type === "link" && doc.file_url) {
      // Link/URL → fetch and extract
      extractedText = await extractFromUrl(doc.file_url, lovableKey);
    } else if (doc.file_url && doc.doc_type !== "link") {
      // File in storage → download and extract
      const { data: fileData, error: fileError } = await supabase.storage
        .from("knowledge-files")
        .download(doc.file_url);

      if (fileError || !fileData) {
        console.error("File download error:", fileError);
        return new Response(JSON.stringify({ error: "Failed to download file" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fileName = doc.file_url.split("/").pop() || "file";
      extractedText = await extractFromFile(fileData, fileName, lovableKey);
    } else {
      return new Response(JSON.stringify({ success: true, message: "Nothing to extract" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save extracted content
    const { error: updateError } = await supabase
      .from("knowledge_documents")
      .update({ extracted_content: extractedText })
      .eq("id", documentId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save extracted content" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Extracted ${extractedText.length} chars from document: ${doc.title}`);

    return new Response(
      JSON.stringify({ success: true, chars: extractedText.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("extract-document error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
