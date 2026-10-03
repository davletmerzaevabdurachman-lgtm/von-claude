import type { NextApiRequest, NextApiResponse } from "next";
import { groqChat } from "../../lib/groq";

function cleanSvg(value: string) {
  let svg = value.trim();
  const fenced = svg.match(/\x60\x60\x60(?:svg|xml)?\s*([\s\S]*?)\x60\x60\x60/i);
  if (fenced) svg = fenced[1].trim();
  const start = svg.indexOf("<svg");
  const end = svg.lastIndexOf("</svg>");
  if (start < 0 || end < 0) throw new Error("Groq hat kein gültiges SVG-Bild erzeugt.");
  svg = svg.slice(start, end + 6);
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "");
  svg = svg.replace(/(?:href|xlink:href)\s*=\s*(["'])\s*(?:https?:|javascript:|data:).*?\1/gi, "");
  return svg;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "Bild-Prompt fehlt." });

  try {
    const result = await groqChat([
      {
        role: "system",
        content:
          "You are TREXOR's image generator. Create the requested image as a self-contained SVG. " +
          "Return ONLY valid SVG markup, no markdown, no explanation. Use a 1024x1024 viewBox, " +
          "strong visual composition, gradients, shapes, paths and text only when useful. " +
          "Do not use scripts, external images, external fonts, links, animations or foreignObject."
      },
      { role: "user", content: prompt }
    ], true);

    const svg = cleanSvg(result.content);
    res.status(200).setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(svg);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Bildgenerierung fehlgeschlagen."
    });
  }
}
