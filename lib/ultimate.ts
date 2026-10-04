type Message = { role: "system" | "user" | "assistant"; content: unknown };

function groqKeys() {
  return Object.keys(process.env)
    .filter((name) => /^GROQ_API_KEY_\\d+$/.test(name))
    .sort((a, b) => Number(a.slice(13)) - Number(b.slice(13)))
    .map((name) => process.env[name]?.trim())
    .filter((x): x is string => Boolean(x));
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
  return blocks.map((x: any) => x?.text || x?.content?.[0]?.text || "").filter(Boolean).join("\n").trim();
}

const SYSTEM = [
  "Du bist TREXOR, ein extrem leistungsfähiger AI-Agent für Coding, Recherche, Debugging, Schreiben, Mathematik und kreative Aufgaben.",
  "Verstehe zuerst die eigentliche Absicht des Nutzers und löse genau diese Aufgabe.",
  "Antworte immer in der Sprache des Nutzers und passe Ton und Detailgrad an.",
  "Sei direkt, natürlich, präzise und praktisch. Kein unnötiges Gelaber und keine erfundenen Fakten.",
  "Prüfe schwierige Aufgaben intern auf Annahmen, Edge Cases, Abhängigkeiten und Fehler.",
  "Bei Code: liefere vollständigen, syntaktisch korrekten und direkt nutzbaren Code. Keine TODO-Platzhalter.",
  "Bei bestehendem Code: analysiere die Ursache, ändere so wenig wie nötig und gib eine konkrete funktionierende Lösung.",
  "Bei Debugging: nenne kurz den Fehlergrund und gib direkt die korrigierte Version.",
  "Bei Websites und Apps: denke wie ein Senior-Full-Stack-Entwickler und baue echte Funktionen, responsive UX und Fehlerbehandlung.",
  "Bei Architektur: bevorzuge einfache, wartbare und robuste Lösungen.",
  "Bei Code-Generierung: berücksichtige Sicherheit, Validierung, Performance, Barrierefreiheit und mobile Nutzung, wenn relevant.",
  "Keine künstlichen Agenten-Erwähnungen. Gib die fertige Antwort direkt an den Nutzer.",
  "FORMATIERUNG: Verwende keine Markdown-Fettschrift und keine Sternchen zur Hervorhebung. Keine # Überschriften am Anfang. Kurze Absätze, Listen mit '-', Code in dreifachen Backticks mit Sprachangabe.",
].join("\n");

function buildAgentPrompt(context: Message[], role: string) {
  return [{ role: "system" as const, content: SYSTEM + "\n\nSpezialrolle: " + role }, ...context];
}

export async function ultimateChat(messages: Message[], options: { vision?: boolean } = {}) {
  const keys = groqKeys();
  if (!keys.length) throw new Error("Kein GROQ_API_KEY_1...GROQ_API_KEY_N konfiguriert.");

  const context = messages.slice(-24);
  const vision = Boolean(options.vision);
  const modelFast = process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";
  const modelThink = process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b";
  const modelVision = process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b";

  const agents = vision
    ? [
        { model: modelVision, role: "Vision-Experte. Analysiere Bilder genau und behaupte nichts, was nicht erkennbar ist.", reasoning: "high" as const },
        { model: modelVision, role: "Unabhängiger Bildprüfer. Suche gezielt nach übersehenen Details.", reasoning: "high" as const },
        { model: modelVision, role: "Multimodaler Problemlöser. Verbinde Bildinhalt und Nutzerfrage.", reasoning: "high" as const },
      ]
    : [
        { model: modelFast, role: "Schneller Generalist. Löse die Aufgabe direkt und praktisch.", reasoning: "medium" as const },
        { model: modelThink, role: "Deep-Reasoning-Experte. Prüfe Logik, Code, Mathematik und Edge Cases streng.", reasoning: "high" as const },
        { model: modelFast, role: "Kritischer Reviewer. Suche Fehler und formuliere die bessere praktische Lösung.", reasoning: "medium" as const },
      ];

  const selected = agents.slice(0, Math.min(agents.length, keys.length));
  const errors: string[] = [];
  const jobs = selected.map((agent, i) =>
    groqCall(keys[i], agent.model, buildAgentPrompt(context, agent.role), agent.reasoning)
      .catch((error) => {
        errors.push(error instanceof Error ? error.message : String(error));
        return null;
      })
  );

  const drafts = (await Promise.all(jobs)).filter(Boolean) as Array<{content:string;model:string}>;
  if (!drafts.length) throw new Error("Alle Groq-Anfragen sind fehlgeschlagen: " + (errors.slice(0, 3).join(" | ") || "Unbekannter Fehler."));

  let final = drafts[0].content;
  let provider = drafts.length > 1 ? "groq-ensemble" : "groq";
  let finalModel = drafts.map((x) => x.model).join(" + ");

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const packed = drafts.map((x, i) => "AGENT " + (i + 1) + " (" + x.model + "):\n" + x.content).join("\n\n---\n\n");
      const judgePrompt = [
        "Du bist der finale Qualitäts-Agent von TREXOR.",
        "Erstelle aus den Agent-Antworten die beste einzelne Antwort für den Nutzer.",
        "Bewerte Korrektheit, Vollständigkeit, Code-Qualität und Befolgung der Nutzeranweisung.",
        "Korrigiere Widersprüche und offensichtliche Fehler.",
        "Keine Erwähnung der Agenten oder internen Bewertung.",
        "Keine Markdown-Fettschrift und keine Sternchen zur Hervorhebung.",
        "Gib ausschließlich die fertige Nutzerantwort zurück.",
        "",
        "NUTZERKONTEXT:", JSON.stringify(context),
        "",
        "AGENT-ANTWORTEN:", packed,
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
      // Groq remains the fallback.
    }
  }

  return { content: final, provider, model: finalModel, usedGroqKeys: selected.length, agentCount: drafts.length };
}

export async function ultimateVision(prompt: string, imageData: string) {
  const keys = groqKeys();
  if (!keys.length) throw new Error("Kein Groq-Key konfiguriert.");

  const imageMessage = {
    role: "user" as const,
    content: [
      { type: "text", text: prompt || "Analysiere dieses Bild vollständig und präzise. Beschreibe nur tatsächlich erkennbare Informationen." },
      { type: "image_url", image_url: { url: imageData } },
    ],
  };

  const selectedKeys = keys.slice(0, 3);
  const results = await Promise.all(selectedKeys.map((key) =>
    groqCall(
      key,
      process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b",
      [
        { role: "system", content: SYSTEM + "\nDu bist der Vision-Spezialist. Prüfe das Bild sorgfältig." },
        imageMessage,
      ],
      "high"
    ).catch(() => null)
  ));

  const drafts = results.filter(Boolean) as Array<{content:string;model:string}>;
  if (!drafts.length) throw new Error("Vision-Analyse fehlgeschlagen.");

  return {
    content: drafts.length === 1 ? drafts[0].content : drafts.map(x => x.content).join("\n\n"),
    provider: "groq-vision-ensemble",
    model: drafts.map(x => x.model).join(" + "),
  };
}

export async function ultimateImage(prompt: string) {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  const enhancedPrompt = [
    "Generate the final image requested by the user.",
    "Make it polished, coherent, detailed and visually intentional.",
    "Do not return a placeholder, wireframe, UI mockup or explanation unless requested.",
    "If the user specifies text in the image, render it exactly when possible.",
    "User request:", prompt.trim(),
  ].join("\n");

  const data = await geminiInteraction(model, enhancedPrompt, {
    type: "image",
    aspect_ratio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "1:1",
    image_size: process.env.GEMINI_IMAGE_SIZE || "4K",
  });

  const image = data?.output_image;
  if (!image?.data) throw new Error(data?.error?.message || "Gemini hat kein Bild zurückgegeben.");
  return {
    imageUrl: "data:" + (image.mime_type || "image/png") + ";base64," + image.data,
    model,
  };
}

export function ultimateConfigured() {
  return groqKeys().length > 0 || Boolean(process.env.GEMINI_API_KEY?.trim());
}
