import type { NextApiRequest, NextApiResponse } from "next";
import { getGroqKeyCount } from "../../lib/groq";
import { ultimateChat } from "../../lib/ultimate";

export const config = {
  api: { bodyParser: { sizeLimit: "12mb" } },
};

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

    const result = await ultimateChat(messages as any, { vision: images.length > 0, homework: Boolean(body?.homework), think: body?.think !== false, speed: body?.speed === "fast" || body?.speed === "deep" ? body.speed : "balanced" });

    return res.status(200).json({
      ok: true,
      content: result.content,
      model: result.model,
      provider: result.provider,
      agentCount: result.agentCount,
      availableKeys: getGroqKeyCount(),
      usedGroqKeys: result.usedGroqKeys,
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
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
