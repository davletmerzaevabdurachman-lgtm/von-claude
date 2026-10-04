type Message = { role: "system" | "user" | "assistant"; content: unknown };

function groqKeys() {
  return [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter((x): x is string => Boolean(x?.trim()));
}

async function groqCall(
  key: string,
  model: string,
  messages: Message[],
  reasoningEffort: "none" | "medium" | "high" = "medium"
) {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: reasoningEffort === "high" ? 0.55 : 0.45,
    max_completion_tokens: 16384,
    stream: false,
  };

  // GPT-OSS supports reasoning_effort but NOT reasoning_format.
  // Qwen 3.8 supports both.
  if (model.startsWith("openai/")) {
    body.reasoning_effort = reasoningEffort;
    body.include_reasoning = false;
  } else if (model.startsWith("qwen/")) {
    body.reasoning_effort = reasoningEffort;
    body.reasoning_format = "hidden";
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Groq request failed (HTTP ${response.status})`
    );
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Groq returned an empty answer");
  }

  return {
    content,
    model: data?.model || model,
  };
}

async function geminiInteraction(model: string, input: unknown, responseFormat?: unknown) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY fehlt.");

  const body: Record<string, unknown> = { model, input };
  if (responseFormat) body.response_format = responseFormat;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini request failed");
  }
  return data;
}

function geminiText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const blocks = Array.isArray(data?.outputs)
    ? data.outputs
    : Array.isArray(data?.output)
      ? data.output
      : [];

  return blocks
    .map((x: any) => x?.text || x?.content?.[0]?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

const SYSTEM = [
  "Du bist TREXOR, ein extrem leistungsfähiger AI-Agent für Coding, Recherche, Debugging, Schreiben, Mathematik und kreative Aufgaben.",
  "Verstehe zuerst die eigentliche Absicht des Nutzers und löse genau diese Aufgabe.",
  "Antworte immer in der Sprache des Nutzers und passe Ton und Detailgrad an den Nutzer an.",
  "Sei direkt, natürlich, präzise und praktisch. Kein unnötiges Gelaber, keine künstlichen Einleitungen und keine erfundenen Fakten.",
  "Prüfe bei schwierigen Aufgaben Annahmen, Edge Cases, Abhängigkeiten und mögliche Fehler intern, bevor du antwortest.",
  "Wenn Informationen fehlen, nutze sinnvolle Annahmen und sage nur dann kurz, welche Annahme du getroffen hast.",
  "Bei Code: liefere vollständigen, syntaktisch korrekten und direkt nutzbaren Code. Keine TODO-Platzhalter und keine ausgelassenen Kernteile.",
  "Bei bestehendem Code: analysiere zuerst die Ursache, ändere so wenig wie nötig und gib danach eine konkrete funktionierende Lösung.",
  "Bei Debugging: nenne kurz den Fehlergrund und gib direkt die korrigierte Version oder exakten Änderungen.",
  "Bei Websites und Apps: denke wie ein Senior-Full-Stack-Entwickler. Baue echte Funktionen, responsive UX, saubere Komponenten, sinnvolle Zustände und Fehlerbehandlung.",
  "Bei Architektur: bevorzuge einfache, wartbare und robuste Lösungen gegenüber unnötiger Komplexität.",
  "Bei Code-Generierung: berücksichtige Sicherheit, Validierung, Performance, Barrierefreiheit und mobile Nutzung, wenn relevant.",
  "Wenn mehrere Lösungen möglich sind, wähle die praktischste Lösung und erkläre Alternativen nur, wenn sie einen echten Vorteil haben.",
  "Wenn der Nutzer eine Datei ändern will, liefere den kompletten relevanten Dateiinhalt, sofern das sinnvoll ist.",
  "Markdown nur dort verwenden, wo es die Lesbarkeit verbessert. Keine sinnlosen Überschriften.",
  "FORMATIERUNG: keine # Überschriften am Anfang; Fließtext in kurzen Absätzen; Listen nur mit '-'; Code immer in dreifachen Backticks mit Sprachangabe; keine Tabellen, wenn eine einfache Liste reicht.",
].join("\n");
function buildAgentPrompt(context: Message[], role: string) {
  return [
    { role: "system" as const, content: SYSTEM + "\n\nSpezialrolle: " + role },
    ...context,
  ];
}

export async function ultimateChat(
  messages: Message[],
  options: { vision?: boolean } = {}
) {
  const keys = groqKeys();
  if (!keys.length) throw new Error("Kein GROQ_API_KEY_1/2/3 konfiguriert.");

  const context = messages.slice(-24);
  const vision = Boolean(options.vision);

  const modelFast = process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";
  const modelThink = process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b";
  const modelVision = process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b";

  const agents = vision
    ? [
        {
          model: modelVision,
          role: "Vision-Experte. Analysiere Bilder extrem genau: Text/OCR, Objekte, Personen als sichtbare Merkmale, Layout, Farben, Abstände, Fehler und relevante Details. Behaupte nichts, was nicht im Bild erkennbar ist.",
          reasoning: "high" as const,
        },
        {
          model: modelVision,
          role: "Unabhängiger Bildprüfer. Suche gezielt nach Details, die eine erste Bildanalyse übersehen könnte, und korrigiere Fehleinschätzungen.",
          reasoning: "high" as const,
        },
        {
          model: modelVision,
          role: "Multimodaler Problemlöser. Verbinde Bildinhalt und Nutzerfrage zu einer konkreten, verständlichen Antwort.",
          reasoning: "high" as const,
        },
      ]
    : [
        {
          model: modelFast,
          role: "Schneller Generalist. Löse die Aufgabe direkt und praktisch.",
          reasoning: "medium" as const,
        },
        {
          model: modelThink,
          role: "Deep-Reasoning-Experte. Prüfe Logik, Code, Mathematik, Architektur und Edge Cases besonders streng.",
          reasoning: "high" as const,
        },
        {
          model: modelFast,
          role: "Kritischer Reviewer. Suche Fehler in möglichen Lösungen und formuliere eine bessere praktische Lösung.",
          reasoning: "medium" as const,
        },
      ];

  // Never send duplicate parallel jobs through the same key when multiple keys exist.
  const selected = agents.slice(0, Math.min(agents.length, keys.length));
  const jobs = selected.map((agent, i) =>
    groqCall(
      keys[i],
      agent.model,
      buildAgentPrompt(context, agent.role),
      agent.reasoning
    ).catch(() => null)
  );

  const drafts = (await Promise.all(jobs)).filter(Boolean) as Array<{
    content: string;
    model: string;
  }>;

  if (!drafts.length) throw new Error("Kein Groq-Modell konnte eine Antwort liefern.");

  let final = drafts[0].content;
  let provider = drafts.length > 1 ? "groq-ensemble" : "groq";
  let finalModel = drafts.map((x) => x.model).join(" + ");

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const packed = drafts
        .map(
          (x, i) =>
            "AGENT " + (i + 1) + " (" + x.model + "):\n" + x.content
        )
        .join("\n\n---\n\n");

      const judgePrompt = [
        "Du bist der finale Qualitäts-Agent von TREXOR.",
        "Erstelle aus den Agent-Antworten die BESTE einzelne Antwort für den Nutzer.",
        "Bewerte die Antworten nach Korrektheit, Vollständigkeit, Code-Qualität, Verständlichkeit und Befolgung der Nutzeranweisung.",
        "Übernimm nicht automatisch die längste Antwort.",
        "Korrigiere Widersprüche und offensichtliche Fehler.",
        "Wenn Code vorhanden ist, darfst du ihn verbessern, aber nicht kaputtkürzen oder wichtige Teile entfernen.",
        "Schreibe natürlich und direkt in der Sprache des Nutzers.",
        "Keine Erwähnung der Agenten, Modelle oder internen Bewertung.",
        "Gib ausschließlich die fertige Nutzerantwort zurück.",
        "",
        "NUTZERKONTEXT:",
        JSON.stringify(context),
        "",
        "AGENT-ANTWORTEN:",
        packed,
      ].join("\n");

      const data = await geminiInteraction(
        process.env.GEMINI_MODEL || "gemini-3.8-flash",
        [{ role: "user", content: [{ type: "text", text: judgePrompt }] }]
      );

      const text = geminiText(data);
      if (text) {
        final = text;
        provider = "groq-ensemble+gemini";
        finalModel += " + " + (process.env.GEMINI_MODEL || "gemini-3.8-flash");
      }
    } catch {
      // Groq remains the working fallback.
    }
  }

  return {
    content: final,
    provider,
    model: finalModel,
    usedGroqKeys: selected.length,
    agentCount: drafts.length,
  };
}

export async function ultimateVision(prompt: string, imageData: string) {
  const keys = groqKeys();
  if (!keys.length) throw new Error("Kein Groq-Key konfiguriert.");

  const imageMessage = {
    role: "user" as const,
    content: [
      {
        type: "text",
        text:
          prompt ||
          "Analysiere dieses Bild vollständig und präzise. Beschreibe nur tatsächlich erkennbare Informationen.",
      },
      { type: "image_url", image_url: { url: imageData } },
    ],
  };

  const selectedKeys = keys.slice(0, 3);
  const results = await Promise.all(
    selectedKeys.map((key) =>
      groqCall(
        key,
        process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b",
        [
          {
            role: "system",
            content:
              SYSTEM +
              "\nDu bist der Vision-Spezialist. Prüfe das Bild sorgfältig und antworte nur mit belegbaren Beobachtungen.",
          },
          imageMessage,
        ],
        "high"
      ).catch(() => null)
    )
  );

  const drafts = results.filter(Boolean) as Array<{
    content: string;
    model: string;
  }>;

  if (!drafts.length) throw new Error("Vision-Analyse fehlgeschlagen.");

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const data = await geminiInteraction(
        process.env.GEMINI_MODEL || "gemini-3.8-flash",
        [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt || "Analysiere dieses Bild präzise.",
              },
              {
                type: "image",
                data: imageData.split(",")[1],
                mime_type:
                  imageData.match(/^data:([^;]+);/)?.[1] || "image/png",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Zusätzliche unabhängige Vision-Analysen:\n\n" +
                  drafts.map((x) => x.content).join("\n\n---\n\n") +
                  "\n\nErstelle daraus die genaueste finale Antwort.",
              },
            ],
          },
        ]
      );

      const text = geminiText(data);
      if (text) {
        return {
          content: text,
          provider: "groq-vision+gemini",
          model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        };
      }
    } catch {
      // Groq vision fallback.
    }
  }

  return {
    content: drafts[0].content,
    provider: "groq-vision-ensemble",
    model: drafts.map((x) => x.model).join(" + "),
  };
}

export async function ultimateImage(prompt: string) {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

  const enhancedPrompt = [
    "Generate the final image requested by the user.",
    "Make it polished, coherent, detailed and visually intentional.",
    "Use accurate proportions, strong composition, clean lighting, realistic or clearly requested stylization, and high-quality rendering.",
    "Do not return a placeholder, wireframe, UI mockup or explanation.",
    "If the user specifies text in the image, render it exactly when possible.",
    "User request:",
    prompt.trim(),
  ].join("\n");

  const data = await geminiInteraction(model, enhancedPrompt, {
    type: "image",
    aspect_ratio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "1:1",
    image_size: process.env.GEMINI_IMAGE_SIZE || "4K",
  });

  const image = data?.output_image;
  if (!image?.data) {
    throw new Error(
      data?.error?.message ||
        "Gemini hat kein Bild zurückgegeben. Prüfe GEMINI_API_KEY, Modell und API-Limit."
    );
  }

  return {
    imageUrl:
      "data:" + (image.mime_type || "image/png") + ";base64," + image.data,
    model,
  };
}

export function ultimateConfigured() {
  return groqKeys().length > 0 || Boolean(process.env.GEMINI_API_KEY?.trim());
}
