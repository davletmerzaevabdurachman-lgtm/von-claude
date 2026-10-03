type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
};

async function callGemini(model: string, contents: unknown[], config: Record<string, unknown> = {}) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY fehlt.");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents,
        generationConfig: config,
      }),
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini ist momentan nicht erreichbar.");
  }
  return data;
}

function responseText(data: any) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part: GeminiPart) => part.text || "")
    .join("")
    .trim();
}

export async function geminiClean(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  groqAnswer: string
) {
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const transcript = conversation.slice(-18)
    .map((m) => m.role.toUpperCase() + ": " + m.content)
    .join("\n\n");

  const prompt = [
    "Du bist die zweite Qualitätsstufe von TREXOR.",
    "Groq hat die eigentliche Antwort erzeugt. Du bekommst den relevanten Chat-Kontext und diese Groq-Antwort.",
    "Mache die Antwort natürlicher, klarer, sauberer und hilfreicher.",
    "Behalte die Sprache und die Absicht des Nutzers.",
    "Erfinde keine Fakten und entferne keine wichtigen Informationen.",
    "Wenn Groq Code geliefert hat: Codeblöcke, Dateinamen und Code müssen inhaltlich exakt erhalten bleiben. Du darfst nur die Erklärung um den Code verbessern.",
    "Keine künstlichen Überschriften, Tabellen oder langen Einleitungen, außer sie sind für die Aufgabe sinnvoll.",
    "Gib ausschließlich die finale Antwort an den Nutzer zurück.",
    "",
    "CHAT-KONTEXT:",
    transcript,
    "",
    "GROQ-ANTWORT:",
    groqAnswer,
  ].join("\n");

  const data = await callGemini(model, [{ role: "user", parts: [{ text: prompt }] }], {
    temperature: 0.35,
  });
  return responseText(data) || groqAnswer;
}

export async function geminiImage(prompt: string) {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  const data = await callGemini(
    model,
    [{ role: "user", parts: [{ text: [
      "Create a finished, high-quality normal image.",
      "Use realistic details, coherent lighting, accurate proportions, strong composition and clean rendering.",
      "Do not create a UI mockup, placeholder, wireframe or generic AI demo unless explicitly requested.",
      "User request: " + prompt
    ].join("\n") }] }],
    {
      responseModalities: ["IMAGE"],
      responseFormat: {
        type: "image",
        aspect_ratio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "1:1",
        image_size: process.env.GEMINI_IMAGE_SIZE || "2K",
      },
      thinkingConfig: {
        thinkingLevel: process.env.GEMINI_IMAGE_THINKING || "high",
      },
    }
  );

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const image = parts.find((part: GeminiPart) => part.inlineData?.data);
  if (!image?.inlineData?.data) throw new Error("Gemini hat kein Bild zurückgegeben.");

  const mime = image.inlineData.mimeType || "image/png";
  return {
    imageUrl: "data:" + mime + ";base64," + image.inlineData.data,
    model,
  };
}

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}
