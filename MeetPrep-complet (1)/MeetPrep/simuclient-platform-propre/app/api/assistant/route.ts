import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// Modèle configurable dans .env.local (GEMINI_MODEL). Valeur par défaut : celle de ton projet.

const MODEL = "gemini-3.5-flash-lite"


const SYSTEM_PROMPT = `Tu es l'assistant IA de SimuClient (MeetPrep), un coach commercial pour les managers de Novalys Conseil.
Tu aides à préparer et à améliorer des réunions clients : découverte, présentation, négociation, gestion de crise, suivi de projet, comité de décision.
Clients simulés : MILLÉSIMAL (vente en ligne de grands vins), ALTYN (énergie et climat), Bouygues Telecom (télécoms), BPI France (banque publique d'investissement), Distalmotion (robotique chirurgicale), L'Oréal (cosmétique).

Règles :
- Réponds toujours en français, de façon concrète et actionnable.
- Texte simple, sans titres markdown ni gras. Pour une liste, utilise des tirets.
- Reste bref : 6 à 10 lignes maximum, sauf si on te demande plus de détails.
- Donne des conseils pratiques (questions à poser, phrases types, erreurs à éviter).
- Tu n'as pas accès à l'historique des simulations de l'utilisateur : ne prétends jamais l'avoir analysé. Si on te le demande, propose de décrire la situation.
- Si la question n'a aucun rapport avec la vente, la relation client ou la préparation de réunions, ramène poliment la discussion sur ce sujet.`

type ChatMessage = { type: "user" | "ai"; content: string }

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé GOOGLE_API_KEY manquante : ajoutez-la dans le fichier .env.local puis relancez npm run dev." },
      { status: 500 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 })
  }

  const history: ChatMessage[] = Array.isArray(body?.messages) ? body.messages.slice(-20) : []
  const contents = history
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.type === "user" ? "user" : "model",
      parts: [{ text: m.content.slice(0, 4000) }],
    }))

  if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
    return NextResponse.json({ error: "Aucune question à traiter." }, { status: 400 })
  }

  const userName = typeof body?.userName === "string" ? body.userName.slice(0, 60) : ""
  const systemText = userName ? `${SYSTEM_PROMPT}\n\nL'utilisateur s'appelle ${userName}.` : SYSTEM_PROMPT

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
        }),
      },
    )

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || `Erreur du modèle IA (HTTP ${res.status}).` },
        { status: 502 },
      )
    }

    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text ?? "")
      .join("")
      .trim()

    if (!text) {
      return NextResponse.json({ error: "Le modèle n'a renvoyé aucune réponse. Reformulez votre question." }, { status: 502 })
    }

    return NextResponse.json({ text })
  } catch (e: any) {
    const timedOut = e?.name === "AbortError"
    return NextResponse.json(
      { error: timedOut ? "Le modèle IA met trop de temps à répondre." : "Impossible de joindre le modèle IA." },
      { status: 504 },
    )
  } finally {
    clearTimeout(timeout)
  }
}