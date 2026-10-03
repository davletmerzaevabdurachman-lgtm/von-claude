import type { NextApiRequest, NextApiResponse } from "next";
import { geminiConfigured, geminiImage } from "../../lib/gemini";

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "Bild-Prompt fehlt." });

  if (!geminiConfigured()) {
    return res.status(503).json({
      error: "GEMINI_API_KEY fehlt. Für TREXOR-Bilder muss ein Gemini API-Key gesetzt sein.",
    });
  }

  try {
    const result = await geminiImage(prompt);

    return res.status(200).json({
      ok: true,
      imageUrl: result.imageUrl,
      model: result.model,
      provider: "gemini",
      resolution: process.env.GEMINI_IMAGE_SIZE || "2K",
    });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Gemini-Bildgenerierung fehlgeschlagen.",
    });
  }
}
