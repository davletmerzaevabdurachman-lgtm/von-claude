import type { NextApiRequest, NextApiResponse } from "next";
import { getGroqKeyCount, groqChat } from "../../lib/groq";
import { geminiClean, geminiConfigured } from "../../lib/gemini";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

const SYSTEM = [
  "Du bist TREXOR, ein leistungsfähiger AI-Assistent für Coding, Recherche, Schreiben und kreative Aufgaben.",
  "Antworte in der Sprache des Nutzers.",
  "Schreibe natürlich, direkt und leicht lesbar. Keine künstlichen Überschriften, Tabellen oder unnötig langen Gliederungen.",
  "Sei konkret und hilfreich. Wenn der Nutzer Code verlangt, liefere funktionierenden, vollständigen Code.",
  "Wenn du eine Website oder Web-App erstellst, gib eine vollständige eigenständige HTML-Datei in genau EINEM Markdown-Codeblock zurück.",
  "Websites sollen modern, sauber und hochwertig wirken: klare Typografie, großzügige Abstände, starke visuelle Hierarchie, responsive Layouts, echte Navigation und sinnvolle Inhalte.",
  "Vermeide generische KI-Webseiten, überladene Kartenraster, zufällige Verläufe und riesige Überschriften ohne Zweck.",
  "Baue mobile Responsiveness ein und achte auf Kontraste, semantisches HTML und zugängliche Buttons und Links.",
  "Wenn du einen Fehler erkennst, korrigiere ihn direkt und nenne die Ursache kurz.",
].join("\n");

function validMessages(value: unknown, images: string[] = []) {
  if (!Array.isArray(value)) return [];
  const clean = value.filter((message: unknown) => {
    if (!message || typeof message !== "object") return false;
    const item = message as { role?: string; content?: unknown };
    return (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      item.content.trim().length > 0;
  }).slice(-24);

  const safeImages = images
    .filter((x) => /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(x))
    .slice(0, 3);

  const last = clean[clean.length - 1] as { role: string; content: string } | undefined;
  if (safeImages.length && last?.role === "user") {
    return clean.map((message, index) => {
      if (index !== clean.length - 1) return message;
      return {
        role: "user",
        content: [
          { type: "text", text: last.content },
          ...safeImages.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
      };
    });
  }

  return clean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const images = Array.isArray(body?.images)
      ? body.images.filter((x: unknown): x is string => typeof x === "string")
      : [];

    const messages = validMessages(body?.messages, images);
    if (!messages.length) {
      return res.status(400).json({ error: "Keine gültige Nachricht übergeben." });
    }

    const result = await groqChat(
      [{ role: "system", content: SYSTEM }, ...messages],
      Boolean(body?.think),
      { vision: images.length > 0 }
    );

    let content = result.content;
    let cleanedBy = "groq";

    if (geminiConfigured()) {
      try {
        const cleanable = messages
          .filter((m: any) => typeof m?.content === "string")
          .map((m: any) => ({ role: m.role, content: m.content }));

        content = await geminiClean(cleanable, result.content);
        cleanedBy = "groq+gemini";
      } catch {
        // Groq remains the reliable fallback if Gemini is unavailable or rate-limited.
      }
    }

    return res.status(200).json({
      ok: true,
      content,
      model: result.model,
      provider: cleanedBy,
      availableKeys: getGroqKeyCount(),
      gemini: geminiConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter KI-Fehler.";
    const status = typeof (error as { status?: number })?.status === "number"
      ? (error as { status: number }).status
      : 502;

    return res.status(status >= 400 && status < 600 ? status : 502).json({
      ok: false,
      error: message,
    });
  }
}
