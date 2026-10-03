import type { NextApiRequest, NextApiResponse } from "next";
import { groqChat } from "../../lib/groq";

function cleanSvg(value: string) {
  let svg = value.trim();
  const fenced = svg.match(/\x60\x60\x60(?:svg|xml)?\s*([\s\S]*?)\x60\x60\x60/i);
  if (fenced) svg = fenced[1].trim();

  const start = svg.indexOf("<svg");
  const end = svg.lastIndexOf("</svg>");
  if (start < 0 || end < 0) {
    throw new Error("Groq hat kein gültiges Bild erzeugt.");
  }

  svg = svg.slice(start, end + 6);
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "");
  svg = svg.replace(
    /(?:href|xlink:href)\s*=\s*(["'])\s*(?:https?:|javascript:|data:).*?\1/gi,
    ""
  );

  if (!/viewBox=/i.test(svg)) {
    svg = svg.replace("<svg", '<svg viewBox="0 0 4096 4096"');
  }
  svg = svg.replace(/<svg([^>]*)>/i, (_match, attrs) => {
    const cleanAttrs = String(attrs)
      .replace(/\swidth\s*=\s*(["']).*?\1/gi, "")
      .replace(/\sheight\s*=\s*(["']).*?\1/gi, "");
    return '<svg' + cleanAttrs + ' width="4096" height="4096">';
  });

  return svg;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "Bild-Prompt fehlt." });
  if (prompt.length > 12000) {
    return res.status(400).json({ error: "Der Bild-Prompt ist zu lang." });
  }

  try {
    // Step 1: Groq checks the live web when the prompt contains a brand,
    // current product, public place, person, or other time-sensitive reference.
    const research = await groqChat(
      [
        {
          role: "system",
          content:
            "Du bist TREXORs Bild-Recherche-Agent. Prüfe den folgenden Bild-Prompt mit Live-Websuche. " +
            "Wenn darin eine Marke, ein Produkt, ein Logo, eine bekannte Person, ein aktueller Ort, " +
            "ein Fahrzeugmodell oder eine andere reale Referenz vorkommt, suche nach verlässlichen " +
            "aktuellen Informationen. Wenn keine Recherche nötig ist, sage das kurz. " +
            "Gib danach eine knappe, sachliche Bild-Referenz zurück. Erfinde keine Markenmerkmale."
        },
        { role: "user", content: prompt }
      ],
      true,
      { webSearch: true }
    );

    // Step 2: Groq turns the prompt + verified research into a crisp 4096x4096 SVG.
    const result = await groqChat(
      [
        {
          role: "system",
          content:
            "Du bist TREXORs High-End-Bildgenerator. Erzeuge ein eigenständiges, visuell starkes " +
            "4096x4096 SVG, das den Nutzer-Prompt so exakt wie möglich umsetzt. " +
            "Das SVG muss als echtes Bild funktionieren und darf keine Erklärung enthalten. " +
            "Return ONLY valid SVG markup. Nutze viewBox 0 0 4096 4096, width 4096 und height 4096. " +
            "Arbeite mit vielen präzisen Vektorformen, Pfaden, Farbverläufen, Schatten, Texturen " +
            "und sauberer Komposition. Verwende Text nur, wenn er ausdrücklich gewünscht ist. " +
            "Keine scripts, keine externen Bilder, keine externen Fonts, keine Links, kein foreignObject. " +
            "Bei einer realen Marke oder einem realen Produkt halte dich an die recherchierten Fakten. " +
            "Die Recherche ist nur eine Referenz; der ursprüngliche Nutzer-Prompt hat Priorität."
        },
        {
          role: "user",
          content:
            "NUTZER-PROMPT:\n" +
            prompt +
            "\n\nLIVE-RECHERCHE VON GROQ:\n" +
            research.content
        }
      ],
      true
    );

    const svg = cleanSvg(result.content);
    res.status(200);
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-TREXOR-Image-Resolution", "4096x4096");
    return res.end(svg);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Bildgenerierung fehlgeschlagen."
    });
  }
}
