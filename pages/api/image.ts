import type { NextApiRequest, NextApiResponse } from "next";
import { ultimateImage } from "../../lib/ultimate";
import { spawn } from "node:child_process";

async function localImage(prompt: string) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || "python3", ["local-image.py", prompt], {
      cwd: process.cwd(),
      env: process.env,
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => out += d.toString());
    child.stderr.on("data", (d) => err += d.toString());
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && out.trim()) return resolve("data:image/png;base64," + out.trim());
      reject(new Error(err.trim() || "Lokale Bildgenerierung fehlgeschlagen."));
    });
  });
}


export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "Bild-Prompt fehlt." });
  try {
    // Primary image path. If it is unavailable or rate-limited, silently fall back to local generation.
    if (process.env.GEMINI_API_KEY?.trim()) {
      try {
        const result = await ultimateImage(prompt);
        return res.status(200).json({ ok: true, imageUrl: result.imageUrl, model: result.model, resolution: process.env.GEMINI_IMAGE_SIZE || "4K" });
      } catch {
        // Continue to local generation below.
      }
    }

    try {
      const imageUrl = await localImage(prompt);
      return res.status(200).json({
        ok: true,
        imageUrl,
        model: process.env.ABDULS_IMAGE_MODEL || process.env.TREXOR_IMAGE_MODEL || "stabilityai/sdxl-turbo",
        resolution: "local"
      });
    } catch {
      return res.status(200).json({
        ok: false,
        imageUrl: "",
        fallback: true,
        message: "Die Bildfunktion ist gerade kurz ausgelastet. Versuche es gleich noch einmal."
      });
    }
  } catch {
    return res.status(200).json({
      ok: false,
      imageUrl: "",
      fallback: true,
      message: "Die Bildfunktion ist gerade kurz ausgelastet. Versuche es gleich noch einmal."
    });
  }
}
