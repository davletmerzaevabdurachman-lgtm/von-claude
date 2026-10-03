import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const groqKeys = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter((value) => Boolean(value?.trim()));

  res.status(200).json({
    ok: true,
    groqConfigured: groqKeys.length > 0,
    keysConfigured: groqKeys.length,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    imageConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    imageMode: "Gemini Nano Banana 2",
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
    imageResolution: process.env.GEMINI_IMAGE_SIZE || "2K",
    builderConfigured: Boolean(
      process.env.GITHUB_TOKEN && process.env.BUILDER_SECRET
    ),
    modelFast: process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b",
    modelThink: process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  });
}
