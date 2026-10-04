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
    if (process.env.GEMINI_API_KEY?.trim()) {
      const result = await ultimateImage(prompt);
      return res.status(200).json({ ok: true, imageUrl: result.imageUrl, model: result.model, provider: "gemini", resolution: process.env.GEMINI_IMAGE_SIZE || "4K" });
    }
    const imageUrl = await localImage(prompt);
    return res.status(200).json({ ok: true, imageUrl, model: process.env.TREXOR_IMAGE_MODEL || "stabilityai/sdxl-turbo", provider: "local", resolution: "local" });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Bildgenerierung fehlgeschlagen." });
  }
}
