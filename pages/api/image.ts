import type { NextApiRequest, NextApiResponse } from "next";
import { groqChat } from "../../lib/groq";

async function generateWithImageProvider(prompt: string) {
  const key = process.env.IMAGE_API_KEY?.trim();
  const endpoint = process.env.IMAGE_API_URL?.trim();
  const model = process.env.IMAGE_MODEL?.trim() || "flux";

  if (!key || !endpoint) {
    throw new Error("Für Bilder fehlt IMAGE_API_KEY oder IMAGE_API_URL. Groq kann aktuell Bilder verstehen, aber nicht direkt als Bilddatei generieren.");
  }

  const url = endpoint.replace(/\/$/, "") + "/" + encodeURIComponent(prompt) + "?model=" + encodeURIComponent(model);
  const response = await fetch(url, { headers: { Authorization: "Bearer " + key } });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "Bildprovider hat die Anfrage abgelehnt.");
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "image/jpeg",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "Bild-Prompt fehlt." });

  try {
    const enhanced = await groqChat([
      { role: "system", content: "Rewrite the user's image idea into one detailed visual prompt. Return only the prompt, no markdown." },
      { role: "user", content: prompt },
    ], false);

    const image = await generateWithImageProvider(enhanced.content);
    res.statusCode = 200;
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "no-store");
    return res.end(image.buffer);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Bildgenerierung fehlgeschlagen.",
    });
  }
}
