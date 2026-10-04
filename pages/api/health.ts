import type { NextApiRequest, NextApiResponse } from "next";

function countGroqKeys() {
  return Object.keys(process.env).filter(
    (name) => /^GROQ_API_KEY_\d+$/.test(name) && Boolean(process.env[name]?.trim())
  ).length;
}

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const keysConfigured = countGroqKeys();
  res.status(200).json({
    ok: true,
    architecture: "ultimate-ensemble",
    groqConfigured: keysConfigured > 0,
    keysConfigured,
    usedGroqKeys: Math.min(keysConfigured, 3),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    imageConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    imageMode: "Gemini image generation",
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
    imageResolution: process.env.GEMINI_IMAGE_SIZE || "4K",
    builderConfigured: Boolean(process.env.GITHUB_TOKEN && process.env.BUILDER_SECRET),
    modelFast: process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b",
    modelThink: process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b",
    modelVision: process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    discordConfigured: Boolean(process.env.DISCORD_TOKEN?.trim()),
    pythonPreload: true
  });
}
