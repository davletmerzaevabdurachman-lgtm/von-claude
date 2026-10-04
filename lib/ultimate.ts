type Message = { role: "system" | "user" | "assistant"; content: unknown };

let groqCursor = 0;

function groqKeys() {
  return Object.keys(process.env)
    .filter((name) => /^GROQ_API_KEY_\d+$/.test(name))
    .sort((a, b) => Number(a.slice(13)) - Number(b.slice(13)))
    .map((name) => process.env[name]?.trim())
    .filter((x): x is string => Boolean(x));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|rate_limit|429|too many requests|tokens per minute|requests per minute/i.test(message);
}

function compactMessages(messages: Message[], maxMessages = 10, maxChars = 3600) {
  return messages.slice(-maxMessages).map((message) => {
    if (typeof message.content !== "string") return message;
    const content = message.content.length > maxChars
      ? "…" + message.content.slice(-maxChars)
      : message.content;
    return { ...message, content };
  });
}

async function groqCall(
  key: string,
  model: string,
  messages: Message[],
  reasoningEffort: "none" | "medium" | "high" = "medium"
) {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: reasoningEffort === "high" ? 0.5 : 0.45,
    max_completion_tokens: reasoningEffort === "high" ? 8192 : 4096,
    stream: false
  };

  if (model.startsWith("openai/")) {
    body.reasoning_effort = reasoningEffort;
    body.include_reasoning = false;
  } else if (model.startsWith("qwen/")) {
    body.reasoning_effort = reasoningEffort;
    body.reasoning_format = "hidden";
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Groq request failed (HTTP ${response.status})`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Empty answer");
  }

  return { content, model: data?.model || model };
}

async function tryGroq(
  keys: string[],
  preferredModel: string,
  fallbackModel: string,
  messages: Message[],
  reasoning: "none" | "medium" | "high"
) {
  if (!keys.length) return null;

  const models = preferredModel === fallbackModel ? [preferredModel] : [preferredModel, fallbackModel];
  const start = groqCursor % keys.length;
  const attempts = Math.min(keys.length, 6);
  const errors: string[] = [];

  for (const model of models) {
    for (let i = 0; i < attempts; i++) {
      const key = keys[(start + i) % keys.length];
      try {
        const result = await groqCall(key, model, messages, reasoning);
        groqCursor = (start + i + 1) % keys.length;
        return result;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        if (isRateLimit(error)) {
          await sleep(Math.min(1800 + i * 450, 3500));
        }
      }
    }
  }

  return null;
}

async function geminiInteraction(model: string, input: unknown, responseFormat?: unknown) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("fallback unavailable");

  const body: Record<string, unknown> = { model, input };
  if (responseFormat) body.response_format = responseFormat;

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("fallback unavailable");
  return data;
}

function geminiText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const blocks = Array.isArray(data?.outputs) ? data.outputs : Array.isArray(data?.output) ? data.output : [];
  return blocks.map((x: any) => x?.text || x?.content?.[0]?.text || "").filter(Boolean).join("\n").trim();
}

const SYSTEM = [
  "Du bist Abduls AI, ein leistungsfähiger, natürlicher Assistent für Schule, Coding, Recherche, Schreiben, Mathematik und kreative Aufgaben.",
  "Verstehe zuerst die eigentliche Absicht und löse genau diese Aufgabe.",
  "Antworte in der Sprache des Nutzers und klinge natürlich, freundlich und menschlich. Keine künstlichen Agenten-Erwähnungen.",
  "Sei direkt, präzise und praktisch. Kein unnötiges Gelaber und keine erfundenen Fakten.",
  "Bei Hausaufgaben: Erkläre verständlich Schritt für Schritt, passe dich dem Niveau an und prüfe das Ergebnis.",
  "Bei Code: liefere vollständigen, syntaktisch korrekten und direkt nutzbaren Code.",
  "Bei bestehenden Fehlern: erkläre kurz die Ursache und gib direkt die funktionierende Lösung.",
  "Bei Websites und Apps: denke wie ein Senior-Full-Stack-Entwickler und achte auf UX, Sicherheit, Performance und mobile Nutzung.",
  "FORMATTIERUNG: Keine Markdown-Fettschrift und keine Sternchen zur Hervorhebung. Kurze natürliche Absätze. Code in dreifachen Backticks mit Sprachangabe."
].join("\n");

function buildPrompt(context: Message[], role: string) {
  return [{ role: "system" as const, content: SYSTEM + "\n\nArbeitsweise: " + role }, ...context];
}

export async function ultimateChat(
  messages: Message[],
  options: { vision?: boolean; homework?: boolean; think?: boolean; speed?: "fast" | "balanced" | "deep" } = {}
) {
  const keys = groqKeys();
  const homework = Boolean(options.homework);
  const vision = Boolean(options.vision);
  const speed = options.speed || (options.think === false ? "fast" : "balanced");

  const context = compactMessages(messages, vision ? 6 : homework ? 10 : 9, vision ? 2200 : homework ? 3000 : 3600);
  if (homework) {
    context.unshift({
      role: "system",
      content: "LERNMODUS: Hilf beim Verstehen. Zeige Rechenschritte, Beispiele, kurze Wissenschecks und eine klare Endlösung. Wenn ein Foto vorhanden ist, arbeite nur mit tatsächlich erkennbaren Angaben."
    });
  }

  const modelFast = process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";
  const modelThink = process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b";
  const modelVision = process.env.GROQ_MODEL_VISION || modelFast;

  let preferredModel = speed === "deep" ? modelThink : modelFast;
  let reasoning: "none" | "medium" | "high" = speed === "fast" ? "none" : speed === "deep" ? "high" : "medium";
  if (vision) {
    preferredModel = modelVision;
    reasoning = "high";
  }

  const role = vision
    ? "Analysiere Bilder sorgfältig und beschreibe nur Erkennbares."
    : homework
      ? "Du bist ein geduldiger Schulcoach. Erkläre die Aufgabe so, dass der Nutzer sie danach selbst versteht."
      : speed === "deep"
        ? "Arbeite besonders gründlich, prüfe Annahmen und Fehler vor der Antwort."
        : speed === "fast"
          ? "Antworte schnell, klar und ohne unnötige Umwege."
          : "Arbeite ausgewogen: verständlich, gründlich und trotzdem kompakt.";

  const result = await tryGroq(keys, preferredModel, modelFast, buildPrompt(context, role), reasoning);
  if (result) {
    return { content: result.content, provider: "primary", model: result.model, usedGroqKeys: 1, agentCount: 1 };
  }

  // A separate final fallback is attempted silently. Provider names never reach the UI.
  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const fallbackPrompt = [
        "Beantworte die Nutzeranfrage als Abduls AI.",
        "Klinge natürlich und menschlich. Bei Schule: verständlich erklären und Lösung zeigen.",
        "Keine Erwähnung interner Systeme, Modelle, Anbieter oder Rate Limits.",
        "",
        JSON.stringify(context)
      ].join("\n");
      const data = await geminiInteraction(
        process.env.GEMINI_MODEL || "gemini-3.8-flash",
        [{ role: "user", content: [{ type: "text", text: fallbackPrompt }] }]
      );
      const text = geminiText(data);
      if (text) return { content: text, provider: "fallback", model: "automatic", usedGroqKeys: 0, agentCount: 1 };
    } catch {
      // Continue to a non-error user message below.
    }
  }

  return {
    content: "Ich bin gerade kurz ausgelastet. Deine Nachricht ist angekommen — warte einen Moment und sende sie einfach noch einmal.",
    provider: "graceful",
    model: "automatic",
    usedGroqKeys: 0,
    agentCount: 0
  };
}

export async function ultimateVision(prompt: string, imageData: string) {
  const keys = groqKeys();
  const imageMessage = {
    role: "user" as const,
    content: [
      { type: "text", text: prompt || "Analysiere dieses Bild sorgfältig. Beschreibe nur tatsächlich erkennbare Informationen." },
      { type: "image_url", image_url: { url: imageData } },
    ],
  };

  const modelFast = process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";
  const modelVision = process.env.GROQ_MODEL_VISION || modelFast;
  const result = await tryGroq(
    keys,
    modelVision,
    modelFast,
    [{ role: "system", content: SYSTEM }, imageMessage],
    "high"
  );

  if (result) {
    return { content: result.content, provider: "primary", model: result.model };
  }

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const data = await geminiInteraction(
        process.env.GEMINI_MODEL || "gemini-3.8-flash",
        [{ role: "user", content: [{ type: "text", text: prompt || "Analysiere das hochgeladene Bild." }, { type: "image_url", image_url: { url: imageData } }] }]
      );
      const text = geminiText(data);
      if (text) return { content: text, provider: "fallback", model: "automatic" };
    } catch {}
  }

  return { content: "Ich kann das Bild gerade nicht zuverlässig auswerten. Bitte versuche es gleich noch einmal.", provider: "graceful", model: "automatic" };
}

export async function ultimateImage(prompt: string) {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  const enhancedPrompt = [
    "Generate the final image requested by the user.",
    "Make it polished, coherent, detailed and visually intentional.",
    "Do not return a placeholder, wireframe or explanation unless requested.",
    "User request:", prompt.trim(),
  ].join("\n");

  const data = await geminiInteraction(model, enhancedPrompt, {
    type: "image",
    aspect_ratio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "1:1",
    image_size: process.env.GEMINI_IMAGE_SIZE || "4K",
  });

  const image = data?.output_image;
  if (!image?.data) throw new Error("Bild konnte gerade nicht erstellt werden.");
  return {
    imageUrl: "data:" + (image.mime_type || "image/png") + ";base64," + image.data,
    model: "automatic",
  };
}

export function ultimateConfigured() {
  return groqKeys().length > 0 || Boolean(process.env.GEMINI_API_KEY?.trim());
}
