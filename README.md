# TREXOR — Claude-Version

TREXOR ist ein AI Code Studio für Vercel.

## Eingebaute Funktionen

- Groq-Key-Fallback: `GROQ_API_KEY_1 -> 2 -> 3` bei Rate-Limit/Provider-Fehlern
- GPT-OSS 20B für schnelle Antworten
- GPT-OSS 120B für Think-Modus
- Bildgenerierung über Pollinations
- AI-Code in einem Codeblock
- Kopieren und Run direkt am Codeblock
- Run Studio für HTML, JavaScript, CSS, Python und JSON
- Python direkt im Browser über Pyodide
- Live-Preview für HTML/JS/CSS
- EXE / DEB / APK Build über GitHub Actions

## Vercel Variablen

In Vercel unter **Settings -> Environment Variables** setzen:

```text
GROQ_API_KEY_1
GROQ_API_KEY_2
GROQ_API_KEY_3
GROQ_MODEL_FAST=openai/gpt-oss-20b
GROQ_MODEL_THINK=openai/gpt-oss-120b

POLLINATIONS_API_KEY
POLLINATIONS_IMAGE_MODEL=flux

GITHUB_TOKEN
GITHUB_OWNER=davletmerzaevabdurachman-lgtm
GITHUB_REPO=von-claude
GITHUB_WORKFLOW=trexor-builder.yml
GITHUB_REF=main
BUILDER_SECRET
```

Die echten Secrets gehören nicht nach GitHub und dürfen nicht als `NEXT_PUBLIC_*` Variable angelegt werden.

## Build

Im Run Studio Builder-Secret eingeben und EXE, DEB oder APK auswählen.
Der Vercel-Endpunkt startet dann den Workflow `.github/workflows/trexor-builder.yml` auf GitHub Actions.

Aktuell:
- HTML -> EXE / DEB / APK
- Python -> EXE

## Lokal

```bash
npm install
npm run dev
```
