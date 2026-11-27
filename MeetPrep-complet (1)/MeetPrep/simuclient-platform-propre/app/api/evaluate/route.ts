import { NextRequest, NextResponse } from "next/server"

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000"

// Relais vers le serveur Python (server.py) : POST /api/evaluate -> POST ${PYTHON_API_URL}/evaluate
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${PYTHON_API_URL}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error("Erreur API Python (evaluate):", error)
    return NextResponse.json(
      { detail: `Serveur Python injoignable sur ${PYTHON_API_URL} (${String(error)})` },
      { status: 502 },
    )
  }
}
