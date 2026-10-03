import type { NextApiRequest, NextApiResponse } from "next";
import { groqChat } from "../../lib/groq";

const SYSTEM = [
  "Du bist TREXOR, ein sehr leistungsfähiger KI-Coding-Assistent.",
  "Antworte in der Sprache des Nutzers, standardmäßig Deutsch.",
  "Hilf beim Erklären, Rechnen, Schreiben, Planen, Debuggen und Programmieren.",
  "Denke sorgfältig nach, bevor du antwortest.",
  "Wenn du Code ausgibst, verwende bei zusammenhängendem Code GENAU EINEN einzigen Markdown-Codeblock.",
  "Bei Websites/Web-Apps steht der komplette Code in genau einem html-Codeblock als eigenständige index.html mit CSS und JavaScript darin.",
  "Kein weiterer Codeblock und kein Code außerhalb dieses Blocks.",
  "Bei Änderungen gib die komplette aktualisierte Datei in genau diesem einen Block zurück."
].join("\n");

function messagesOf(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((message: unknown) => {
      if (!message || typeof message !== "object") return false;
      const item = message as { role?: string; content?: unknown };
      return (
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
      );
    })
    .slice(-30);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const messages = messagesOf(body?.messages);

    if (!messages.length) {
      return res.status(400).json({ error: "Keine Nachrichten übergeben." });
    }

    const upstream = await groqChat(
      [{ role: "system", content: SYSTEM }, ...messages],
      Boolean(body?.think)
    );

    if (!upstream.ok || !upstream.body) {
      let message = "KI-Anfrage fehlgeschlagen.";

      try {
        const raw = await upstream.text();
        const parsed = JSON.parse(raw);
        message = parsed?.error?.message || message;
      } catch {}

      return res.status(upstream.status || 502).json({ error: message });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
      if (!res.writableEnded) res.end();
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Serverfehler.";

    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
