import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const groqKeys = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter((value) => Boolean(value?.trim()));

  res.status(200).json({
    ok: true,
    architecture: "ultimate-ensemble",
    groqConfigured: groqKeys.length > 0,
    keysConfigured: groqKeys.length,
    usedGroqKeys: Math.min(groqKeys.length, 3),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    imageConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    imageMode: "Gemini 3.1 Flash Image",
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
    imageResolution: process.env.GEMINI_IMAGE_SIZE || "4K",
    builderConfigured: Boolean(process.env.GITHUB_TOKEN && process.env.BUILDER_SECRET),
    modelFast: process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b",
    modelThink: process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b",
    modelVision: process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  });
}
