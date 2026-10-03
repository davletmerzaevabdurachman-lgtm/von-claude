import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "Bild-Prompt fehlt." });

  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    return res.status(503).json({
      error: "XAI_API_KEY fehlt. Für echte normale Bilder braucht TREXOR einen Grok-Imagine-Key."
    });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model: process.env.XAI_IMAGE_MODEL || "grok-imagine-image-2.0",
        prompt: `Create a polished, high-quality finished image based on this user request. Interpret the request naturally and fill in missing visual details intelligently. Prioritize realistic materials, accurate proportions, coherent lighting, sharp details, clean composition, natural depth, and a professional finished look. Do not make it look like an AI demo, UI mockup, placeholder, or low-detail concept unless the user explicitly asks for that style. User request: ${prompt}`,
        response_format: "url",
        n: 1,
        aspect_ratio: process.env.XAI_IMAGE_ASPECT_RATIO || "auto",
        resolution: process.env.XAI_IMAGE_RESOLUTION || "2k",
        quality: "medium",
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message || "Grok Imagine hat die Anfrage abgelehnt.");
    }

    const imageUrl = data?.data?.[0]?.url;
    if (!imageUrl) throw new Error("Grok Imagine hat kein Bild zurückgegeben.");

    return res.status(200).json({
      ok: true,
      imageUrl,
      model: data?.model || process.env.XAI_IMAGE_MODEL || "grok-imagine-image-2.0",
      resolution: process.env.XAI_IMAGE_RESOLUTION || "2k",
    });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Bildgenerierung fehlgeschlagen."
    });
  }
}
