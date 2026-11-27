import { NextRequest, NextResponse } from "next/server"

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000"

// Relais : envoie l'extrait audio WAV au serveur Python (analyse vocale)
export async function POST(req: NextRequest) {
  try {
    const audio = await req.arrayBuffer()
    const res = await fetch(`${PYTHON_API_URL}/voice`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: audio,
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ detail: `Serveur Python injoignable (${String(error)})` }, { status: 502 })
  }
}