"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Bot, Brain, Play, RotateCcw, Send, Sparkles, User } from "lucide-react"

interface ChatMessage {
  id: number
  type: "user" | "ai"
  content: string
  timestamp: Date
}

// Suggestions affichées dans la colonne de gauche et sur l'écran d'accueil du chat
const SUGGESTIONS = [
  { icon: "🔍", title: "Découverte client", hint: "Techniques d'écoute", prompt: "Comment améliorer ma technique de découverte client ?" },
  { icon: "🍷", title: "Objections MILLÉSIMAL", hint: "Vente de vin en ligne", prompt: "Quelles objections puis-je rencontrer avec MILLÉSIMAL ?" },
  { icon: "🤝", title: "Négocier avec BPI France", hint: "Secteur public", prompt: "Comment négocier avec BPI France ?" },
  { icon: "📊", title: "Présenter à L'Oréal", hint: "Cosmétique", prompt: "Conseils pour présenter à L'Oréal ?" },
  { icon: "🚨", title: "Gestion de crise", hint: "Client mécontent", prompt: "Quelles sont les meilleures pratiques pour gérer une crise client ?" },
  { icon: "🎯", title: "Préparer ma simulation", hint: "Avant de démarrer", prompt: "Comment me préparer pour ma prochaine simulation ?" },
]

export default function Assistant() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Pas de connexion : utilisateur par défaut
    const userData =
      (() => {
        try {
          const saved = localStorage.getItem("user")
          return saved && JSON.parse(saved) ? saved : null
        } catch {
          return null // valeur illisible dans le navigateur : on repart sur l'utilisateur par défaut
        }
      })() ?? JSON.stringify({ name: "Test", email: "", role: "Manager" })
    setUser(JSON.parse(userData))
  }, [])

  // Fait défiler la conversation vers le dernier message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const addMessage = (type: "user" | "ai", content: string) => {
    const message: ChatMessage = {
      id: messagesRef.current.length + 1,
      type,
      content,
      timestamp: new Date(),
    }
    messagesRef.current = [...messagesRef.current, message]
    setMessages(messagesRef.current)
  }

  // Envoie la question au modèle IA (route /api/assistant) avec l'historique de la conversation
  const sendMessage = async (override?: string) => {
    const text = (override ?? inputMessage).trim()
    if (!text || isTyping) return

    setError(null)
    setInputMessage("")
    addMessage("user", text)
    setIsTyping(true)

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: user?.name,
          messages: messagesRef.current.map((m) => ({ type: m.type, content: m.content })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Erreur du serveur (HTTP ${res.status})`)
      addMessage("ai", data.text)
    } catch (e: any) {
      setError(e?.message || "Impossible de contacter l'assistant.")
    } finally {
      setIsTyping(false)
    }
  }

  const resetConversation = () => {
    messagesRef.current = []
    setMessages([])
    setError(null)
    setInputMessage("")
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const firstName = (user.name || "").split(" ")[0]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <header className="bg-white border-b px-4 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.push("/")} className="flex items-center space-x-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Accueil</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Assistant IA</h1>
              <p className="text-gray-600">Votre coach commercial personnel</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              En ligne
            </Badge>
            <Button variant="outline" size="sm" onClick={resetConversation} disabled={messages.length === 0 && !error}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Nouvelle conversation
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-4 gap-6">
          {/* Colonne de gauche */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-base">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  <span>Suggestions</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s.title}
                    variant="outline"
                    size="sm"
                    disabled={isTyping}
                    className="w-full justify-start text-left h-auto p-3 bg-transparent"
                    onClick={() => sendMessage(s.prompt)}
                  >
                    <span className="mr-2 text-lg">{s.icon}</span>
                    <div>
                      <div className="font-medium text-sm">{s.title}</div>
                      <div className="text-xs text-gray-500">{s.hint}</div>
                    </div>
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-100">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-gray-700 mb-4">Prêt à mettre vos conseils en pratique ?</p>
                <Button
                  onClick={() => router.push("/")}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Lancer une simulation
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Zone de chat */}
          <Card className="lg:col-span-3 flex flex-col">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle>Assistant IA SimuClient</CardTitle>
                  <CardDescription>Spécialisé dans l&apos;accompagnement commercial Novalys Conseil</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col">
              {/* Messages */}
              <div className="h-[28rem] overflow-y-auto mb-4 space-y-4 p-4 bg-gray-50 rounded-lg">
                {messages.length === 0 && (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Brain className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-lg font-medium text-gray-900 mb-1">Bonjour {firstName} ! 👋</p>
                    <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                      Je vous aide à préparer vos réunions clients et à progresser en négociation. Choisissez une
                      question ou écrivez la vôtre.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto text-left">
                      {SUGGESTIONS.slice(0, 4).map((s) => (
                        <button
                          key={s.title}
                          type="button"
                          onClick={() => sendMessage(s.prompt)}
                          className="rounded-lg border border-gray-200 bg-white p-3 hover:border-purple-300 hover:shadow-sm transition"
                        >
                          <div className="font-medium text-sm text-gray-900">
                            {s.icon} {s.title}
                          </div>
                          <div className="text-xs text-gray-500">{s.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`flex items-start space-x-2 max-w-[85%] ${
                        message.type === "user" ? "flex-row-reverse space-x-reverse" : ""
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white ${
                          message.type === "user" ? "bg-blue-500" : "bg-gradient-to-r from-purple-500 to-blue-500"
                        }`}
                      >
                        {message.type === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div
                        className={`rounded-lg p-3 ${
                          message.type === "user"
                            ? "bg-blue-500 text-white"
                            : "bg-white border border-gray-200 text-gray-900"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <p className={`text-xs mt-1 ${message.type === "user" ? "text-blue-100" : "text-gray-500"}`}>
                          {message.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-start space-x-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:100ms]"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:200ms]"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Erreur */}
              {error && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Saisie */}
              <div className="flex space-x-2">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Posez votre question..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  className="flex-1"
                />
                <Button onClick={() => sendMessage()} disabled={!inputMessage.trim() || isTyping}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}