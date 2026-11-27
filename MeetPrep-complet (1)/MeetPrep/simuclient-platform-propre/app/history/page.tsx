"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, History as HistoryIcon } from "lucide-react"

const CLIENTS = [
  { id: "millesimal", name: "MILLÉSIMAL" },
  { id: "altyn", name: "ALTYN" },
  { id: "bouygues", name: "Bouygues Telecom" },
  { id: "bpi", name: "BPI France" },
  { id: "distalmotion", name: "Distalmotion" },
  { id: "loreal", name: "L'Oréal" },
]

type Meeting = {
  date: string
  meeting_type: string
  service?: string
  context?: string
  transcript: { speaker: string; message: string }[]
  evaluation?: { score?: number; resume?: string; points_a_ameliorer?: string[] } | null
}

// Réunions enregistrées par le serveur Python (dossier data/<entreprise>/), celles que l'agent retrouve via le RAG
export default function History() {
  const router = useRouter()
  const [clientId, setClientId] = useState("bpi")
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    fetch(`/api/history/${clientId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.detail || `Erreur HTTP ${res.status}`)
        if (!cancelled) setMeetings([...data].reverse()) // plus récente en premier
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4">
        <div className="container mx-auto flex items-center space-x-3">
          <Button variant="ghost" onClick={() => router.push("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Accueil
          </Button>
          <HistoryIcon className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Historique des réunions</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-wrap gap-2 mb-6">
          {CLIENTS.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={clientId === c.id ? "default" : "outline"}
              onClick={() => setClientId(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && meetings.length === 0 && (
          <p className="text-sm text-gray-500">Aucune réunion enregistrée pour ce client.</p>
        )}

        <div className="space-y-4">
          {meetings.map((m, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <span>{new Date(m.date).toLocaleString("fr-FR")}</span>
                  <Badge variant="outline">{m.meeting_type}</Badge>
                  {m.service && <Badge variant="secondary">{m.service}</Badge>}
                  {m.evaluation?.score !== undefined && (
                    <Badge className="ml-auto">{m.evaluation.score}/100</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {m.evaluation?.resume && <p className="text-gray-800">{m.evaluation.resume}</p>}
                {m.evaluation?.points_a_ameliorer?.length ? (
                  <p className="text-gray-600">
                    <span className="font-medium">À améliorer :</span> {m.evaluation.points_a_ameliorer.join(" ; ")}
                  </p>
                ) : null}
                <p className="text-xs text-gray-400">{m.transcript.length} messages échangés</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
