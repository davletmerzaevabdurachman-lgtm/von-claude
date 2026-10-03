import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const groqKeys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3
  ].filter((value) => Boolean(value?.trim()));

  res.status(200).json({
    ok: true,
    groqConfigured: groqKeys.length > 0,
    keysConfigured: groqKeys.length,
    imageConfigured: Boolean(process.env.XAI_API_KEY?.trim()),
    imageMode: "Grok Imagine",
    imageResolution: process.env.XAI_IMAGE_RESOLUTION || "2k",
    builderConfigured: Boolean(
      process.env.GITHUB_TOKEN && process.env.BUILDER_SECRET
    ),
    modelFast: process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b",
    modelThink: process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b"
  });
}
