import type { NextApiRequest, NextApiResponse } from "next";
import { groqChat } from "../../lib/groq";

async function generateImage(prompt: string) {
  const model = (process.env.POLLINATIONS_IMAGE_MODEL || "flux").trim();
  const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) +
    "?model=" + encodeURIComponent(model) + "&nologo=true";
  const key = process.env.POLLINATIONS_API_KEY?.trim();
  const headers: Record<string,string> = {};
  if (key) headers.Authorization = "Bearer " + key;
  const response = await fetch(url, { headers });
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

    const image = await generateImage(enhanced.content);
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
