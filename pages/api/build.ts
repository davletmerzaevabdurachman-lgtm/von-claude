import type { NextApiRequest, NextApiResponse } from "next";

const languages = new Set([
  "html",
  "python",
  "javascript",
  "typescript",
  "css",
  "json"
]);

const targets = new Set(["exe", "deb", "apk"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST wird unterstützt." });
  }

  const secret = String(req.body?.secret || "");
  const expected = process.env.BUILDER_SECRET || "";

  if (!expected || secret !== expected) {
    return res.status(401).json({
      error: "Builder-Secret ist falsch oder nicht konfiguriert."
    });
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  const owner =
    process.env.GITHUB_OWNER || "davletmerzaevabdurachman-lgtm";
  const repo = process.env.GITHUB_REPO || "von-claude";
  const workflow = process.env.GITHUB_WORKFLOW || "trexor-builder.yml";
  const ref = process.env.GITHUB_REF || "main";

  if (!token) {
    return res.status(503).json({
      error: "GITHUB_TOKEN fehlt in Vercel."
    });
  }

  const code = String(req.body?.code || "");
  const language = String(req.body?.language || "").toLowerCase();
  const target = String(req.body?.target || "").toLowerCase();

  if (!code.trim()) return res.status(400).json({ error: "Kein Code vorhanden." });
  if (code.length > 45000) {
    return res.status(413).json({ error: "Code für Build zu groß." });
  }

  if (!languages.has(language)) {
    return res.status(400).json({
      error: "Sprache wird vom Builder nicht unterstützt."
    });
  }

  if (!targets.has(target)) {
    return res.status(400).json({ error: "Ungültiges Build-Ziel." });
  }

  if (target === "apk" && language !== "html") {
    return res.status(400).json({
      error: "APK ist aktuell für HTML/Web-Apps."
    });
  }

  if (target === "deb" && language !== "html") {
    return res.status(400).json({
      error: "DEB ist aktuell für HTML/Web-Apps."
    });
  }

  if (target === "exe" && !["html", "python"].includes(language)) {
    return res.status(400).json({
      error: "EXE ist aktuell für HTML und Python."
    });
  }

  const code_b64 = Buffer.from(code, "utf8").toString("base64");

  try {
    const response = await fetch(
      "https://api.github.com/repos/" +
        owner +
        "/" +
        repo +
        "/actions/workflows/" +
        workflow +
        "/dispatches",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ref,
          inputs: { language, target, code_b64 }
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status).json({
        error: detail || "GitHub konnte den Build nicht starten."
      });
    }

    return res.status(202).json({
      ok: true,
      message: "Build gestartet.",
      workflowUrl:
        "https://github.com/" +
        owner +
        "/" +
        repo +
        "/actions/workflows/" +
        workflow
    });
  } catch (error) {
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Build-Service nicht erreichbar."
    });
  }
}
