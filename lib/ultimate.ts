type Message = { role: "system" | "user" | "assistant"; content: unknown };

function groqKeys() {
  return [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter((x): x is string => Boolean(x?.trim()));
}

async function groqCall(key: string, model: string, messages: Message[]) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, messages, temperature: 0.45, stream: false }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "Groq request failed");
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Groq returned an empty answer");
  return { content, model: data?.model || model };
}

async function geminiInteraction(model: string, input: unknown, responseFormat?: unknown) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY fehlt.");
  const body: Record<string, unknown> = { model, input };
  if (responseFormat) body.response_format = responseFormat;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "Gemini request failed");
  return data;
}

function geminiText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const blocks = Array.isArray(data?.outputs) ? data.outputs : Array.isArray(data?.output) ? data.output : [];
  return blocks
    .map((x: any) => x?.text || x?.content?.[0]?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

const SYSTEM = [
  "Du bist TREXOR, ein extrem leistungsfähiger AI-Agent für Coding, Recherche, Analyse, Schreiben, Mathematik und kreative Aufgaben.",
  "Antworte in der Sprache des Nutzers. Sei direkt, präzise und praktisch.",
  "Prüfe deine Lösung gedanklich auf Fehler, bevor du antwortest.",
  "Bei Code: liefere vollständigen, lauffähigen Code und erhalte Dateinamen/Codeblöcke sauber.",
  "Bei Websites: modern, responsive, zugänglich, echte Funktionen statt Platzhalter.",
  "Keine erfundenen Fakten. Wenn Informationen aktuell sein müssen, kennzeichne Unsicherheit statt zu raten.",
].join("\n");

export async function ultimateChat(messages: Message[], options: { vision?: boolean } = {}) {
  const keys = groqKeys();
  if (!keys.length) throw new Error("Kein GROQ_API_KEY_1/2/3 konfiguriert.");

  const vision = Boolean(options.vision);
  const context = messages.slice(-24);
  const modelFast = process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";
  const modelThink = process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b";
  const modelVision = process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b";

  const prompts = vision
    ? [
        [{ role: "system", content: SYSTEM + "\nAnalysiere das Bild extrem genau: Text/OCR, Objekte, Layout, Farben, Fehler und relevante Details." }, ...context],
        [{ role: "system", content: SYSTEM + "\nPrüfe die Bildanalyse eines anderen Agents kritisch und ergänze übersehene Details." }, ...context],
        [{ role: "system", content: SYSTEM + "\nErstelle eine zweite unabhängige Vision-Analyse mit Fokus auf Genauigkeit." }, ...context],
      ]
    : [
        [{ role: "system", content: SYSTEM }, ...context],
        [{ role: "system", content: SYSTEM + "\nArbeite als Deep-Reasoning-Spezialist. Prüfe Architektur, Edge Cases und Fehlerquellen besonders streng." }, ...context],
        [{ role: "system", content: SYSTEM + "\nArbeite als unabhängiger Kritiker. Finde mögliche Fehler und verbessere die beste praktische Lösung." }, ...context],
      ];

  const models = vision ? [modelVision, modelVision, modelVision] : [modelFast, modelThink, modelFast];
  const jobs = prompts.map((p, i) => groqCall(keys[i % keys.length], models[i], p as Message[]).catch(() => null));
  const drafts = (await Promise.all(jobs)).filter(Boolean) as Array<{content:string;model:string}>;

  if (!drafts.length) throw new Error("Kein Groq-Modell konnte eine Antwort liefern.");

  let final = drafts
    .slice()
    .sort((a, b) => b.content.length - a.content.length)[0].content;
  let provider = "groq-ensemble";
  let finalModel = drafts.map(x => x.model).join(" + ");

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const packed = drafts.map((x, i) => "AGENT " + (i + 1) + " (" + x.model + "):\n" + x.content).join("\n\n---\n\n");
      const judgePrompt = [
        "Du bist der finale Qualitäts- und Synthese-Agent von TREXOR.",
        "Vereine die besten Teile der Agent-Antworten zu EINER finalen Antwort.",
        "Korrigiere Widersprüche und offensichtliche Fehler.",
        "Erhalte Code inhaltlich korrekt und vollständig; erfinde keine fehlenden Dateien.",
        "Antworte ausschließlich mit der finalen Nutzerantwort, ohne über die Agenten zu sprechen.",
        "",
        "NUTZERKONTEXT:",
        JSON.stringify(context),
        "",
        "AGENT-ANTWORTEN:",
        packed,
      ].join("\n");

      const data = await geminiInteraction(
        process.env.GEMINI_MODEL || "gemini-3.8-flash",
        [{ role: "user", content: [{ type: "text", text: judgePrompt }] }]
      );
      const text = geminiText(data);
      if (text) {
        final = text;
        provider = "groq-ensemble+gemini";
        finalModel += " + " + (process.env.GEMINI_MODEL || "gemini-3.8-flash");
      }
    } catch {
      // Groq ensemble remains the fallback.
    }
  }

  return { content: final, provider, model: finalModel, usedGroqKeys: Math.min(keys.length, 3), agentCount: drafts.length };
}

export async function ultimateVision(prompt: string, imageData: string) {
  const keys = groqKeys();
  if (!keys.length) throw new Error("Kein Groq-Key konfiguriert.");
  const imageMessage = {
    role: "user" as const,
    content: [
      { type: "text", text: prompt || "Analysiere dieses Bild vollständig und präzise." },
      { type: "image_url", image_url: { url: imageData } },
    ],
  };
  const results = await Promise.all(
    [0, 1, 2].map((i) =>
      groqCall(keys[i % keys.length], process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b", [
        { role: "system", content: SYSTEM + "\nDu bist Vision-Spezialist. Sei extrem genau." },
        imageMessage,
      ]).catch(() => null)
    )
  );
  const drafts = results.filter(Boolean) as Array<{content:string;model:string}>;
  if (!drafts.length) throw new Error("Vision-Analyse fehlgeschlagen.");

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const data = await geminiInteraction(
        process.env.GEMINI_MODEL || "gemini-3.8-flash",
        [
          { role: "user", content: [{ type: "text", text: prompt || "Analysiere das Bild." }, { type: "image", data: imageData.split(",")[1], mime_type: imageData.match(/^data:([^;]+);/)?.[1] || "image/png" }] },
          { role: "user", content: [{ type: "text", text: "Nutze zusätzlich diese unabhängigen Vision-Analysen und korrigiere sie bei Bedarf:\n\n" + drafts.map(x => x.content).join("\n\n---\n\n") }] },
        ]
      );
      const text = geminiText(data);
      if (text) return { content: text, provider: "groq-vision+gemini", model: process.env.GEMINI_MODEL || "gemini-3.8-flash" };
    } catch {}
  }
  return { content: drafts[0].content, provider: "groq-vision-ensemble", model: drafts.map(x => x.model).join(" + ") };
}

export async function ultimateImage(prompt: string) {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  const data = await geminiInteraction(model, prompt, {
    type: "image",
    mime_type: "image/png",
    aspect_ratio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "1:1",
    image_size: process.env.GEMINI_IMAGE_SIZE || "2K",
  });
  const image = data?.output_image;
  if (!image?.data) throw new Error("Gemini hat kein Bild zurückgegeben.");
  return {
    imageUrl: "data:" + (image.mime_type || "image/png") + ";base64," + image.data,
    model,
  };
}

export function ultimateConfigured() {
  return groqKeys().length > 0 || Boolean(process.env.GEMINI_API_KEY?.trim());
}
