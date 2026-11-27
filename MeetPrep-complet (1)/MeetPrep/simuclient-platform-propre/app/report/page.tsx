"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, FileText, Clock, User, Target, Building2, Briefcase, ArrowLeft, Home } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts"

// Libellés (les identifiants viennent de l'URL : ?client=bpi&type=suivi)
const CLIENT_NAMES: Record<string, string> = {
  millesimal: "MILLÉSIMAL",
  altyn: "ALTYN",
  bouygues: "Bouygues Telecom",
  bpi: "BPI France",
  distalmotion: "Distalmotion",
  loreal: "L'Oréal",
}
const MEETING_NAMES: Record<string, string> = {
  decouverte: "Découverte",
  presentation: "Présentation",
  negociation: "Négociation",
  crise: "Gestion de crise",
  suivi: "Suivi projet",
  comite: "Comité de décision",
}

type Evaluation = {
  score: number
  resume: string
  points_positifs: string[]
  points_a_ameliorer: string[]
  justification: string
  criteres: Record<string, number>
}
type VoicePoint = { time: string; stress: number; confidence: number; engagement: number }

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)} min ${seconds % 60} s`

export default function Report() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const clientId = searchParams?.get("client") || ""
  const meetingTypeId = searchParams?.get("type") || ""
  const duration = Number.parseInt(searchParams?.get("duration") || "0") || 0

  const [loaded, setLoaded] = useState(false)
  const [manager, setManager] = useState("Manager")
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [voice, setVoice] = useState<VoicePoint[]>([])
  const [service, setService] = useState("")
  const [context, setContext] = useState("")
  const [today, setToday] = useState("")

  // Tout vient du serveur Python : évaluation (/evaluate), mesures vocales (/voice), service et consignes saisis à l'accueil
  useEffect(() => {
    const read = (key: string) => {
      try {
        const raw = sessionStorage.getItem(key)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    }
    setEvaluation(read("meetprep_evaluation"))
    setVoice(read("meetprep_voice") ?? [])
    const c = read("meetprep_context")
    setService(c?.service ?? "")
    setContext(c?.context ?? "")
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null")
      if (u?.name) setManager(u.name)
    } catch {}
    setToday(new Date().toLocaleDateString("fr-FR"))
    setLoaded(true)
  }, [])

  if (!loaded) return null

  if (!evaluation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle>Aucun rapport disponible</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Le rapport est généré à partir de l'évaluation du serveur. Terminez d'abord une simulation.
            </p>
            <Button onClick={() => router.push("/")}>
              <Home className="w-4 h-4 mr-2" />
              Retour à l'accueil
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const c = evaluation.criteres || {}
  const skillsData = [
    { skill: "Clarté", score: c.clarte ?? 0 },
    { skill: "Pertinence", score: c.pertinence ?? 0 },
    { skill: "Objections", score: c.objections ?? 0 },
    { skill: "Posture", score: c.posture ?? 0 },
    { skill: "Gestion du stress", score: c.gestion_stress ?? 0 },
  ]
  const score = evaluation.score ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4 print:hidden">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" onClick={() => router.back()} className="flex items-center space-x-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Retour</span>
            </Button>
            <FileText className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Rapport de simulation</h1>
              <p className="text-gray-600">Analyse complète et recommandations</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {/* « Enregistrer au format PDF » dans la fenêtre d'impression du navigateur */}
            <Button onClick={() => window.print()} className="flex items-center space-x-2">
              <Download className="w-4 h-4" />
              <span>Imprimer / PDF</span>
            </Button>
            <Button variant="outline" onClick={() => router.push("/")} className="flex items-center space-x-2">
              <Home className="w-4 h-4" />
              <span>Accueil</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 print:px-0 print:py-4">
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl mb-2">Rapport de performance</CardTitle>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <User className="w-4 h-4" />
                    <span>{manager}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Building2 className="w-4 h-4" />
                    <span>{CLIENT_NAMES[clientId] ?? clientId}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Target className="w-4 h-4" />
                    <span>{MEETING_NAMES[meetingTypeId] ?? meetingTypeId}</span>
                  </div>
                  {service && (
                    <div className="flex items-center space-x-1">
                      <Briefcase className="w-4 h-4" />
                      <span>{service}</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>
                      {today}
                      {duration > 0 && ` · ${formatDuration(duration)}`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-600">{score}/100</div>
                <Badge variant={score >= 80 ? "default" : score >= 60 ? "secondary" : "destructive"}>
                  {score >= 80 ? "Excellent" : score >= 60 ? "Bien" : "À améliorer"}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Évolution de la voix pendant la simulation</CardTitle>
            </CardHeader>
            <CardContent>
              {voice.length > 0 ? (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={voice}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Area type="monotone" dataKey="confidence" name="Confiance" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                        <Area type="monotone" dataKey="engagement" name="Engagement" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                        <Area type="monotone" dataKey="stress" name="Stress" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center space-x-6 mt-4 text-sm">
                    <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-green-500 rounded" /><span>Confiance</span></div>
                    <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-blue-500 rounded" /><span>Engagement</span></div>
                    <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-red-500 rounded" /><span>Stress</span></div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 py-12 text-center">
                  Aucune mesure vocale : l'analyse de la voix n'était pas active (micro coupé, modèle vocal non chargé ou
                  serveur Python indisponible).
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analyse par compétence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={skillsData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="skill" type="category" width={110} />
                    <Tooltip />
                    <Bar dataKey="score" name="Score" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Synthèse de l'évaluation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {evaluation.resume && <p className="font-medium text-gray-900">{evaluation.resume}</p>}
            {evaluation.justification && <p className="text-gray-700">{evaluation.justification}</p>}
            {context && (
              <p className="text-gray-500 border-t pt-3">
                <span className="font-medium">Consignes données au client simulé :</span> {context}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-green-700">Points forts</CardTitle>
            </CardHeader>
            <CardContent>
              {evaluation.points_positifs?.length ? (
                <ul className="space-y-2">
                  {evaluation.points_positifs.map((p, i) => (
                    <li key={i} className="flex items-start space-x-2 text-sm">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Aucun point fort relevé.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-blue-700">Recommandations</CardTitle>
            </CardHeader>
            <CardContent>
              {evaluation.points_a_ameliorer?.length ? (
                <ul className="space-y-2">
                  {evaluation.points_a_ameliorer.map((p, i) => (
                    <li key={i} className="flex items-start space-x-2 text-sm">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Aucune recommandation.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500 print:mt-4">
          <p>Rapport généré par SimuClient</p>
        </div>
      </div>
    </div>
  )
}
