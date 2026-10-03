import type { NextApiRequest, NextApiResponse } from "next";
import { getGroqKeyCount, groqChat } from "../../lib/groq";

const SYSTEM = [
  "Du bist TREXOR, ein leistungsfähiger AI-Assistent für Coding, Recherche, Schreiben und kreative Aufgaben.",
  "Antworte in der Sprache des Nutzers.",
  "Sei konkret und hilfreich. Wenn der Nutzer Code verlangt, liefere funktionierenden, vollständigen Code.",
  "Wenn du eine Website oder Web-App erstellst, gib eine vollständige eigenständige HTML-Datei in genau EINEM Markdown-Codeblock zurück.",
  "Bei normalem Code darfst du mehrere Dateien mit klaren Dateinamen angeben, aber jeder Codeblock muss eine Sprache haben.",
  "Erkläre Änderungen kurz und vermeide unnötige Wiederholungen.",
  "Wenn du einen Fehler erkennst, korrigiere ihn direkt und nenne die Ursache.",
].join("\n");

function validMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((message: unknown) => {
    if (!message || typeof message !== "object") return false;
    const item = message as { role?: string; content?: unknown };
    return (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" && item.content.trim().length > 0;
  }).slice(-24);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const messages = validMessages(body?.messages);
    if (!messages.length) return res.status(400).json({ error: "Keine gültige Nachricht übergeben." });

    const result = await groqChat([{ role: "system", content: SYSTEM }, ...messages], Boolean(body?.think));
    return res.status(200).json({
      ok: true, content: result.content, model: result.model, provider: "groq",
      availableKeys: getGroqKeyCount(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter KI-Fehler.";
    const status = typeof (error as { status?: number })?.status === "number"
      ? (error as { status: number }).status : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({ ok: false, error: message });
  }
}
