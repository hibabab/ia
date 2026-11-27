import { NextRequest, NextResponse } from "next/server"

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000"

// Relais vers le serveur Python : GET /api/history/bpi -> GET ${PYTHON_API_URL}/history/bpi
export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const res = await fetch(`${PYTHON_API_URL}/history/${encodeURIComponent(params.clientId)}?limit=20`, {
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json(
      { detail: `Serveur Python injoignable sur ${PYTHON_API_URL} (${String(error)})` },
      { status: 502 },
    )
  }
}
