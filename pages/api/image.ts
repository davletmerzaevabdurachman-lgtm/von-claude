import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  const key = process.env.POLLINATIONS_API_KEY?.trim();
  const model = process.env.POLLINATIONS_IMAGE_MODEL || "flux";

  if (!prompt) return res.status(400).json({ error: "Bild-Prompt fehlt." });
  if (!key) {
    return res
      .status(503)
      .json({ error: "POLLINATIONS_API_KEY fehlt in Vercel." });
  }

  try {
    const url =
      "https://gen.pollinations.ai/image/" +
      encodeURIComponent(prompt) +
      "?model=" +
      encodeURIComponent(model);

    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + key }
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status).json({
        error: detail || "Bildgenerierung fehlgeschlagen."
      });
    }

    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "image/jpeg"
    );
    res.setHeader("Cache-Control", "public,max-age=3600");

    return res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Bildgenerierung fehlgeschlagen."
    });
  }
}
