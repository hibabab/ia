"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import TalkingAvatar, { AVATAR_LOOKS } from "@/components/TalkingAvatar"
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
  Brain,
  Send,
  Heart,
  Zap,
  Camera,
  CameraOff,
  Settings,
  Maximize,
  ArrowLeft,
} from "lucide-react"

// Types pour la simulation
interface Message {
  id: number
  speaker: "user" | "ai"
  text: string
  timestamp: string
  audioUrl?: string
}

interface EmotionState {
  stress: number
  confidence: number
  engagement: number
  energy: number
}

interface AIResponse {
  text: string
  emotion: "neutral" | "happy" | "concerned" | "excited" | "thinking"
  gesture: "none" | "pointing" | "nodding" | "explaining" | "listening"
}

// Les photos sont dans public/avatars/ (ex : public/avatars/hortense.jpg -> "/avatars/hortense.jpg")
const clientsData = {
  millesimal: {
    name: "MILLÉSIMAL",
    logo: "🍷",
    contact: "Hortense Bernard - Directrice Marketing",
    avatar: "/avatars/hortense.jpg",
  },
  altyn: {
    name: "ALTYN",
    logo: "🏢",
    contact: "Sophie Lapierre - Directrice Communication",
    avatar: "/avatars/sophie.jpg",
  },
  bouygues: {
    name: "Bouygues Telecom",
    logo: "📱",
    contact: "William Boutet - Responsable Partenariats",
    avatar: "/avatars/william.jpg",
  },
  bpi: {
    name: "BPI France",
    logo: "🏦",
    contact: "Nicolas Parpex - Directeur French Touch Capital",
    avatar: "/avatars/nicolas.jpg",
  },
  distalmotion: {
    name: "Distalmotion",
    logo: "🤖",
    contact: "Dr. Laurent Benoit - R&D Director",
    avatar: "/avatars/laurent.jpg",
  },
  loreal: {
    name: "L'Oréal",
    logo: "💄",
    contact: "Marie Dubois - Digital Innovation Manager",
    avatar: "/avatars/marie.jpg",
  },
}

const meetingTypes = {
  decouverte: { name: "Découverte", icon: "🔍" },
  presentation: { name: "Présentation", icon: "📊" },
  negociation: { name: "Négociation", icon: "🤝" },
  crise: { name: "Gestion de crise", icon: "🚨" },
  suivi: { name: "Suivi projet", icon: "📋" },
  comite: { name: "Comité de décision", icon: "👥" },
}

// Service et consignes saisis sur la page d'accueil (envoyés à l'agent Python et au RAG)
function readContext(): { service: string; context: string } {
  try {
    const raw = sessionStorage.getItem("meetprep_context")
    if (raw) {
      const c = JSON.parse(raw)
      return { service: String(c.service ?? ""), context: String(c.context ?? "") }
    }
  } catch {}
  return { service: "", context: "" }
}

export default function Simulate() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number>()

  // États de la simulation
  const [user, setUser] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [simulationTime, setSimulationTime] = useState(0)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [currentAIResponse, setCurrentAIResponse] = useState<AIResponse | null>(null)
  const [emotions, setEmotions] = useState<EmotionState>({
    stress: 0,
    confidence: 0,
    engagement: 0,
    energy: 0,
  })
  const [voiceStatus, setVoiceStatus] = useState("En attente de votre voix…")
  const [voiceTip, setVoiceTip] = useState("")

  // États de l'avatar IA
  const [avatarEmotion, setAvatarEmotion] = useState<"neutral" | "happy" | "concerned" | "excited" | "thinking">(
    "neutral",
  )
  const [avatarSpeaking, setAvatarSpeaking] = useState(false)
  const [avatarVolume, setAvatarVolume] = useState([75])
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true)
  const aiVoiceEnabledRef = useRef(true)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Conversation réelle avec le serveur Python
  const [userInput, setUserInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const messagesRef = useRef<Message[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recognitionRef = useRef<any>(null)
  const capCtxRef = useRef<AudioContext | null>(null)
  const capProcRef = useRef<ScriptProcessorNode | null>(null)
  const pcmChunksRef = useRef<Float32Array[]>([])
  const pcmCountRef = useRef(0)
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const voiceBusyRef = useRef(false)
  const voiceT0Ref = useRef(0)
  const voiceTimelineRef = useRef<{ time: string; stress: number; confidence: number; engagement: number }[]>([])
  const avatarSpeakingRef = useRef(false)
  const [voiceMode, setVoiceMode] = useState(true) // transcription vocale automatique
  const finalTextRef = useRef("")
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleUserResponseRef = useRef<(text?: string) => void>(() => {})

  // Paramètres de la simulation
  const clientId = searchParams?.get("client") || ""
  const meetingTypeId = searchParams?.get("type") || ""

  const client = clientsData[clientId as keyof typeof clientsData]
  const meetingType = meetingTypes[meetingTypeId as keyof typeof meetingTypes]

  // Nom du contact et initiales (affichées si la photo est introuvable)
  const contactName = client?.contact.split(" - ")[0] ?? ""
  const initials = contactName
    .split(" ")
    .filter((n) => /^[A-Za-zÀ-ÿ]/.test(n) && !n.endsWith("."))
    .map((n) => n[0])
    .join("")

  // Questions IA contextuelles par client et type de réunion
  const aiQuestions = {
    millesimal: {
      decouverte: [
        "Bonjour ! Je suis Hortense Bernard, Directrice Marketing chez MILLÉSIMAL. Ravi de vous rencontrer. Comment Novalys Conseil peut-il nous accompagner dans notre croissance digitale ?",
        "Nous avons 2,5 millions de bouteilles en stock et 234 000 références. Comment gérez-vous ce type de volumétrie ?",
        "Notre collaboration précédente avec Novalys Conseil sur l'IA prédictive a été un succès. Quelles nouvelles innovations proposez-vous ?",
        "Nous nous développons à l'international, notamment aux USA. Avez-vous de l'expérience sur ces marchés ?",
      ],
      negociation: [
        "Votre proposition est intéressante, mais le budget me semble élevé pour une PME comme nous...",
        "SQLI nous a proposé 30% moins cher pour un projet similaire. Pouvez-vous vous aligner ?",
        "Quelles garanties pouvez-vous nous donner sur les délais ? Notre ouverture à New York ne peut pas attendre.",
        "Pouvons-nous échelonner les paiements sur 18 mois comme notre précédent projet ?",
      ],
    },
    bpi: {
      decouverte: [
        "Bonjour, Nicolas Parpex, Directeur French Touch Capital chez Bpifrance. Comment Novalys Conseil accompagne-t-elle l'écosystème startup français ?",
        "Nous injectons 63 milliards d'euros par an dans l'économie. Quelle est votre vision de l'innovation française ?",
        "Nos secteurs prioritaires sont la santé, cybersécurité, défense. Quelles sont vos expertises sur ces domaines ?",
        "Comment Novalys Conseil contribue-t-elle au Plan IA et à la souveraineté numérique française ?",
      ],
      comite: [
        "Présentez-nous votre stratégie pour accompagner nos 50 implantations régionales.",
        "Quel ROI pouvez-vous garantir sur un investissement de cette ampleur ?",
        "Comment votre solution s'intègre-t-elle avec nos partenaires bancaires existants ?",
        "Quels sont vos références sur des projets d'envergure nationale similaires ?",
      ],
    },
    bouygues: {
      presentation: [
        "William Boutet, Responsable Partenariats. Présentez-nous votre solution pour optimiser notre réseau 5G.",
        "Nous avons 10 000 conseillers et 500 boutiques. Comment gérez-vous cette échelle ?",
        "Comment votre solution s'intègre-t-elle avec nos partenaires Samsung, Apple, Google ?",
        "Quels sont les bénéfices concrets pour l'expérience de nos 15 millions de clients ?",
      ],
      crise: [
        "Nous avons un problème majeur ! Notre nouveau système plante depuis 3 jours !",
        "Nos 10 000 conseillers ne peuvent plus travailler correctement !",
        "Cette panne nous coûte des millions d'euros par jour !",
        "Comment comptez-vous résoudre ce problème rapidement ?",
      ],
    },
  }

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
  }, [router])

  useEffect(() => {
    avatarSpeakingRef.current = avatarSpeaking
  }, [avatarSpeaking])

  // --- Analyse vocale réelle (serveur Python : voice_analysis.py) ---
  const encodeWav = (samples: Float32Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const writeStr = (o: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(o + i, str.charCodeAt(i))
    }
    writeStr(0, "RIFF")
    view.setUint32(4, 36 + samples.length * 2, true)
    writeStr(8, "WAVE")
    writeStr(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, "data")
    view.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) {
      const v = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true)
    }
    return buffer
  }

  const sendVoiceChunk = useCallback(async () => {
    const SR = 16000
    if (voiceBusyRef.current || pcmCountRef.current < SR * 3) return // il faut au moins 3 s d'audio
    const total = pcmCountRef.current
    const samples = new Float32Array(total)
    let offset = 0
    for (const c of pcmChunksRef.current) {
      samples.set(c, offset)
      offset += c.length
    }
    pcmChunksRef.current = []
    pcmCountRef.current = 0

    voiceBusyRef.current = true
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: encodeWav(samples, SR),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setVoiceStatus(data?.detail || "Analyse vocale indisponible")
      } else if (data.ready === false) {
        setVoiceStatus("Chargement du modèle vocal (1re fois : quelques minutes)…")
      } else if (!data.speaking) {
        setVoiceStatus("En attente de votre voix…")
      } else {
        setVoiceStatus("Analyse vocale active")
        setVoiceTip(data.conseil || "")
        const sec = Math.round((Date.now() - voiceT0Ref.current) / 1000)
        voiceTimelineRef.current.push({
          time: `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`,
          stress: data.stress,
          confidence: data.confidence,
          engagement: data.engagement,
        })
        // lissage : évite des sauts brusques entre deux mesures
        setEmotions((prev) => {
          const first = prev.stress === 0 && prev.confidence === 0 && prev.engagement === 0 && prev.energy === 0
          const mix = (a: number, b: number) => (first ? b : a * 0.4 + b * 0.6)
          return {
            stress: mix(prev.stress, data.stress),
            confidence: mix(prev.confidence, data.confidence),
            engagement: mix(prev.engagement, data.engagement),
            energy: mix(prev.energy, data.energy),
          }
        })
      }
    } catch {
      setVoiceStatus("Serveur d'analyse vocale injoignable")
    } finally {
      voiceBusyRef.current = false
    }
  }, [])

  const stopVoiceCapture = useCallback(() => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current)
    voiceTimerRef.current = null
    try {
      capProcRef.current?.disconnect()
      capCtxRef.current?.close()
    } catch {}
    capProcRef.current = null
    capCtxRef.current = null
  }, [])

  const startVoiceCapture = useCallback(
    (stream: MediaStream) => {
      try {
        voiceT0Ref.current = Date.now()
        voiceTimelineRef.current = []
        const ctx = new AudioContext({ sampleRate: 16000 }) // 16 kHz = format attendu par le modèle
        if (ctx.state === "suspended") ctx.resume()
        const source = ctx.createMediaStreamSource(stream)
        const proc = ctx.createScriptProcessor(4096, 1, 1)
        proc.onaudioprocess = (e) => {
          if (avatarSpeakingRef.current) return // on n'analyse pas la voix du client IA
          const data = new Float32Array(e.inputBuffer.getChannelData(0))
          pcmChunksRef.current.push(data)
          pcmCountRef.current += data.length
          if (pcmCountRef.current > 16000 * 12) {
            // garde au plus ~12 s
            const dropped = pcmChunksRef.current.shift()
            pcmCountRef.current -= dropped?.length ?? 0
          }
        }
        source.connect(proc)
        proc.connect(ctx.destination)
        capCtxRef.current = ctx
        capProcRef.current = proc
        voiceTimerRef.current = setInterval(sendVoiceChunk, 5000)
      } catch (e) {
        console.error("Capture audio impossible:", e)
        setVoiceStatus("Analyse vocale indisponible (navigateur non compatible : utilisez Chrome ou Edge)")
      }
    },
    [sendVoiceChunk],
  )

  // Initialisation de la caméra et du micro
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoEnabled,
        audio: isAudioEnabled,
      })

      streamRef.current = stream

      if (videoRef.current && isVideoEnabled) {
        videoRef.current.srcObject = stream
      }

      // Configuration de l'analyse audio
      if (isAudioEnabled) {
        audioContextRef.current = new AudioContext()
        if (audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume()
        }
        analyserRef.current = audioContextRef.current.createAnalyser()
        const source = audioContextRef.current.createMediaStreamSource(stream)
        source.connect(analyserRef.current)
        analyserRef.current.fftSize = 256

        // Démarrer l'analyse du volume
        analyzeAudio()

        // Démarrer l'analyse vocale réelle (envoi d'extraits au serveur Python)
        startVoiceCapture(stream)
      }
    } catch (error) {
      console.error("Erreur accès média:", error)
    }
  }, [isVideoEnabled, isAudioEnabled, startVoiceCapture])

  // Analyse du volume audio en temps réel
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

    const analyze = () => {
      if (!analyserRef.current) return

      analyserRef.current.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length
      const normalizedVolume = (average / 255) * 100

      setVolumeLevel(normalizedVolume)

      animationFrameRef.current = requestAnimationFrame(analyze)
    }

    analyze()
  }, [])

  // Génération de la réponse du client : appel au serveur Python via /api/chat
  const generateAIResponse = useCallback(
    async (history: Message[]): Promise<AIResponse> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)
      let res: Response
      try {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            clientId,
            meetingType: meetingTypeId,
            ...readContext(),
            messages: history.map((m) => ({ speaker: m.speaker, text: m.text })),
          }),
        })
      } catch (e: any) {
        throw new Error(
          e?.name === "AbortError"
            ? "Le serveur IA ne répond pas (délai de 120 s dépassé). Vérifiez le terminal Python."
            : "Impossible de joindre le serveur IA.",
        )
      } finally {
        clearTimeout(timeout)
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail || data?.error || `Serveur IA indisponible (HTTP ${res.status})`)

      // Émotion et geste de l'avatar selon le type de réunion
      let emotion: AIResponse["emotion"] = "neutral"
      let gesture: AIResponse["gesture"] = "none"

      switch (meetingTypeId) {
        case "crise":
          emotion = Math.random() > 0.5 ? "concerned" : "neutral"
          gesture = "explaining"
          break
        case "negociation":
          emotion = Math.random() > 0.7 ? "thinking" : "neutral"
          gesture = "pointing"
          break
        case "presentation":
          emotion = "happy"
          gesture = "explaining"
          break
        default:
          emotion = "neutral"
          gesture = "listening"
      }

      return { text: data.text, emotion, gesture }
    },
    [clientId, meetingTypeId],
  )

  // Précharge les voix du navigateur (Chrome les charge de façon asynchrone)
  useEffect(() => {
    if (!("speechSynthesis" in window)) return
    speechSynthesis.getVoices()
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices()
  }, [])

  // Synthèse vocale pour l'avatar
  const speakText = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window) || !aiVoiceEnabledRef.current) return
      const synth = window.speechSynthesis
      synth.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      const voices = synth.getVoices()
      const frVoice = voices.find((v) => v.lang === "fr-FR") || voices.find((v) => v.lang.toLowerCase().startsWith("fr"))
      if (frVoice) utterance.voice = frVoice
      utterance.lang = "fr-FR"
      utterance.rate = 0.95
      utterance.pitch = 1.0
      utterance.volume = Math.max(0.05, avatarVolume[0] / 100)

      utterance.onstart = () => setAvatarSpeaking(true)
      utterance.onend = () => setAvatarSpeaking(false)
      utterance.onerror = (e) => {
        console.warn("Synthèse vocale:", e.error)
        setAvatarSpeaking(false)
        if (e.error === "not-allowed") {
          setAiError("Le navigateur a bloqué la voix : cliquez sur « 🔊 Écouter » sous le message du client.")
        }
      }

      utteranceRef.current = utterance // évite que le navigateur supprime l'énoncé avant la fin
      synth.speak(utterance)
      synth.resume()
    },
    [avatarVolume],
  )

  // Ajoute un message à la conversation (state + ref)
  const addMessage = useCallback((speaker: "user" | "ai", text: string) => {
    const message: Message = {
      id: messagesRef.current.length + 1,
      speaker,
      text,
      timestamp: new Date().toLocaleTimeString(),
    }
    messagesRef.current = [...messagesRef.current, message]
    setMessages(messagesRef.current)
    return message
  }, [])

  // Démarrer la simulation : le client ouvre la réunion
  const startSimulation = useCallback(async () => {
    setIsRecording(true)
    setAiError(null)
    await initializeMedia()

    timerRef.current = setInterval(() => {
      setSimulationTime((prev) => prev + 1)
    }, 1000)

    try {
      setIsThinking(true)
      const welcome = await generateAIResponse([])
      setCurrentAIResponse(welcome)
      addMessage("ai", welcome.text)
      setAvatarEmotion(welcome.emotion)
      speakText(welcome.text)
    } catch (error: any) {
      setAiError(error?.message || "Erreur de connexion au serveur Python")
    } finally {
      setIsThinking(false)
    }
  }, [initializeMedia, generateAIResponse, speakText, addMessage])

  // Envoi de la réponse du manager -> réponse du client
  const handleUserResponse = useCallback(async (override?: string) => {
    const text = (override ?? userInput).trim()
    if (!text || !isRecording || isPaused || isThinking) return

    if ("speechSynthesis" in window) speechSynthesis.cancel()
    setAiError(null)
    setUserInput("")
    finalTextRef.current = ""
    addMessage("user", text)

    try {
      setIsThinking(true)
      setAvatarEmotion("thinking")
      const aiResponse = await generateAIResponse(messagesRef.current)
      setCurrentAIResponse(aiResponse)
      addMessage("ai", aiResponse.text)
      setAvatarEmotion(aiResponse.emotion)
      speakText(aiResponse.text)
    } catch (error: any) {
      setAvatarEmotion("neutral")
      setAiError(error?.message || "Erreur de connexion au serveur Python")
    } finally {
      setIsThinking(false)
    }
  }, [userInput, isRecording, isPaused, isThinking, generateAIResponse, speakText, addMessage])

  handleUserResponseRef.current = handleUserResponse

  // Bouton micro : active / désactive la transcription vocale automatique
  const toggleDictation = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setAiError("La dictée vocale n'est pas supportée par ce navigateur (utilisez Chrome ou Edge).")
      return
    }
    setAiError(null)
    setVoiceMode((v) => !v)
  }

  // Écoute en continu : transcrit ce que vous dites et envoie après ~2,5 s de silence.
  // L'écoute est coupée quand le client parle ou réfléchit (pour ne pas capter sa voix).
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const shouldListen = !!SR && voiceMode && isRecording && !isPaused && !isThinking && !avatarSpeaking
    if (!shouldListen) return

    let stopped = false
    const rec = new SR()
    rec.lang = "fr-FR"
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e: any) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          finalTextRef.current += (finalTextRef.current ? " " : "") + r[0].transcript.trim()
        } else {
          interim += r[0].transcript
        }
      }
      const full = (finalTextRef.current + (interim ? " " + interim.trim() : "")).trim()
      setUserInput(full)

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (full) {
          finalTextRef.current = ""
          handleUserResponseRef.current(full)
        }
      }, 2500)
    }
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start()
        } catch {}
      }
    }
    rec.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return
      stopped = true
      setIsListening(false)
      setVoiceMode(false)
      setAiError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Micro refusé : autorisez le micro dans la barre d'adresse du navigateur."
          : e.error === "network"
            ? "La dictée vocale nécessite une connexion internet (service de reconnaissance de Chrome/Edge)."
            : `Dictée impossible (${e.error}). Vous pouvez taper votre réponse.`,
      )
    }

    try {
      rec.start()
      recognitionRef.current = rec
      setIsListening(true)
    } catch {}

    return () => {
      stopped = true
      rec.onend = null
      try {
        rec.stop()
      } catch {}
      setIsListening(false)
    }
  }, [voiceMode, isRecording, isPaused, isThinking, avatarSpeaking])

  // Contrôles de la simulation
  const togglePause = () => {
    setIsPaused(!isPaused)
    if (speechSynthesis.speaking) {
      if (isPaused) {
        speechSynthesis.resume()
      } else {
        speechSynthesis.pause()
      }
    }
  }

  const toggleVideo = async () => {
    setIsVideoEnabled(!isVideoEnabled)
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled
      }
    }
  }

  const toggleAudio = () => {
    setIsAudioEnabled(!isAudioEnabled)
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled
      }
    }
  }

  const endSimulation = async () => {
    if (isEnding) return
    setIsEnding(true)

    // Arrêter tous les médias
    if (timerRef.current) clearInterval(timerRef.current)
    stopVoiceCapture()
    recognitionRef.current?.stop()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if ("speechSynthesis" in window && speechSynthesis.speaking) {
      speechSynthesis.cancel()
    }

    // Évaluation du manager par le serveur Python
    try {
      sessionStorage.removeItem("meetprep_evaluation")
      const transcript = messagesRef.current.map((m) => ({ speaker: m.speaker, text: m.text }))
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, meetingType: meetingTypeId, ...readContext(), transcript }),
      })
      if (res.ok) {
        sessionStorage.setItem("meetprep_evaluation", JSON.stringify(await res.json()))
      }
    } catch (error) {
      console.error("Erreur évaluation:", error)
    }

    try {
      sessionStorage.setItem("meetprep_voice", JSON.stringify(voiceTimelineRef.current))
    } catch {}
    router.push(`/feedback?client=${clientId}&type=${meetingTypeId}&duration=${simulationTime}`)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      recognitionRef.current?.stop()
      stopVoiceCapture()
    }
  }, [stopVoiceCapture])

  // Nettoyage à la fermeture
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const getEmotionColor = (value: number) => {
    if (value > 70) return "text-green-600"
    if (value > 40) return "text-yellow-600"
    return "text-red-600"
  }

  const getAvatarStyle = () => {
    let transform = "scale(1)"
    let filter = "brightness(1)"

    if (avatarSpeaking) {
      transform = "scale(1.05)"
    }

    switch (avatarEmotion) {
      case "happy":
        filter = "brightness(1.1) saturate(1.2)"
        break
      case "concerned":
        filter = "brightness(0.9) saturate(0.8)"
        break
      case "excited":
        filter = "brightness(1.2) saturate(1.3)"
        break
      case "thinking":
        filter = "brightness(0.95) saturate(0.9)"
        break
    }

    return {
      transform,
      filter,
      transition: "all 0.3s ease",
    }
  }

  if (!user || !client || !meetingType) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
            <Button
              variant="ghost"
              onClick={() => router.push("/")}
              className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Accueil</span>
            </Button>
            <div className="text-xl sm:text-2xl flex-shrink-0">{client.logo}</div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-semibold truncate">Simulation Live - {client.name}</h1>
              <div className="flex items-center space-x-2 flex-wrap">
                <Badge variant="outline" className="border-blue-600 text-blue-600 text-xs">
                  {meetingType.icon} {meetingType.name}
                </Badge>
                <Badge variant="secondary" className="text-xs truncate max-w-24 sm:max-w-none">
                  {user.name}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            <div className="text-sm sm:text-lg font-mono text-green-600">{formatTime(simulationTime)}</div>
            <Button variant="outline" onClick={togglePause} className="border-gray-300 bg-transparent text-gray-700 p-2">
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </Button>
            <Button variant="destructive" onClick={endSimulation} className="text-xs sm:text-sm">
              <Square className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Terminer</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 sm:gap-6">
          {/* Zone vidéo principale */}
          <div className="xl:col-span-3 space-y-4 sm:space-y-6">
            {/* Avatar IA et Utilisateur */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Avatar IA */}
              <Card className="bg-white border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-gray-900 text-sm sm:text-base">
                    <span className="truncate">{client.contact}</span>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {avatarSpeaking && (
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse delay-100"></div>
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse delay-200"></div>
                        </div>
                      )}
                      <Badge className="bg-blue-600 text-xs">{avatarEmotion}</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <div className="relative w-full h-64 sm:h-80 bg-gradient-to-br from-blue-100 to-purple-200 rounded-lg flex items-center justify-center overflow-hidden">
                      {/* Avatar humain animé : la bouche bouge quand le client parle */}
                      <div style={getAvatarStyle()} className="absolute inset-0 flex items-end justify-center">
                        <TalkingAvatar
                          look={AVATAR_LOOKS[clientId] ?? AVATAR_LOOKS.millesimal}
                          speaking={avatarSpeaking}
                          thinking={isThinking}
                          emotion={avatarEmotion}
                          className="h-full w-auto"
                        />
                      </div>
                      <span className="absolute top-3 right-3 text-xl bg-white/80 rounded-full p-1.5">
                        {client.logo}
                      </span>

                      {/* Nom de l'entreprise */}
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white bg-black/50 px-2 py-1 rounded">
                        {client.name}
                      </div>

                      {/* Indicateur "le client réfléchit" */}
                      {isThinking && (
                        <div className="absolute top-3 left-3 flex space-x-1">
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:100ms]"></div>
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:200ms]"></div>
                        </div>
                      )}
                    </div>

                    {/* Contrôles avatar */}
                    <div className="absolute bottom-4 right-4 flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-white/80 border-gray-300 text-gray-700 p-2"
                        title={aiVoiceEnabled ? "Couper la voix du client" : "Activer la voix du client"}
                        onClick={() => {
                          const next = !aiVoiceEnabled
                          setAiVoiceEnabled(next)
                          aiVoiceEnabledRef.current = next
                          if (!next && "speechSynthesis" in window) speechSynthesis.cancel()
                        }}
                      >
                        {aiVoiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="outline" className="bg-white/80 border-gray-300 text-gray-700 p-2">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Volume avatar */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Volume Avatar</span>
                      <span>{avatarVolume[0]}%</span>
                    </div>
                    <Slider
                      value={avatarVolume}
                      onValueChange={setAvatarVolume}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Vidéo utilisateur */}
              <Card className="bg-white border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-gray-900 text-sm sm:text-base">
                    <span className="truncate">Vous - {user.name}</span>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <div
                        className={`w-3 h-3 rounded-full ${isRecording && !isPaused ? "bg-red-500 animate-pulse" : "bg-gray-500"}`}
                      ></div>
                      <Badge variant={isRecording ? "default" : "secondary"} className="text-xs">
                        {isRecording ? "Live" : "Arrêté"}
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    {isVideoEnabled ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-48 sm:h-64 bg-gray-100 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-full h-48 sm:h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                        <CameraOff className="w-12 h-12 sm:w-16 sm:h-16 text-gray-500" />
                      </div>
                    )}

                    {/* Contrôles utilisateur */}
                    <div className="absolute bottom-4 left-4 flex space-x-2">
                      <Button
                        size="sm"
                        variant={isVideoEnabled ? "default" : "outline"}
                        onClick={toggleVideo}
                        className="bg-white/90 text-gray-900 border border-gray-300 hover:bg-white p-2"
                      >
                        {isVideoEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant={isAudioEnabled ? "default" : "outline"}
                        onClick={toggleAudio}
                        className="bg-white/90 text-gray-900 border border-gray-300 hover:bg-white p-2"
                      >
                        {isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </Button>
                    </div>

                    <div className="absolute bottom-4 right-4">
                      <Button size="sm" variant="outline" className="bg-white/80 border-gray-300 text-gray-700 p-2">
                        <Maximize className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Transcription en temps réel */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-gray-900 text-sm sm:text-base">Transcription Live</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-32 sm:h-48 overflow-y-auto space-y-3 bg-gray-100 p-4 rounded-lg">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.speaker === "ai" ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-xs px-3 py-2 rounded-lg ${
                          message.speaker === "ai" ? "bg-blue-600 text-white" : "bg-green-600 text-white"
                        }`}
                      >
                        <div className="text-xs opacity-70 mb-1 truncate">
                          {message.speaker === "ai" ? client.contact.split(" - ")[0] : user.name.split(" ")[0]} -{" "}
                          {message.timestamp}
                        </div>
                        <div className="text-xs sm:text-sm">{message.text}</div>
                        {message.speaker === "ai" && (
                          <button
                            type="button"
                            onClick={() => speakText(message.text)}
                            className="mt-1 text-xs underline opacity-80 hover:opacity-100"
                          >
                            🔊 Écouter
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {avatarSpeaking && (
                    <div className="flex justify-start">
                      <div className="bg-blue-600 text-white px-3 py-2 rounded-lg">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-100"></div>
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-200"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Panneau de contrôle */}
          <div className="space-y-4 sm:space-y-6">
            {/* Contrôles principaux */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-gray-900 text-sm sm:text-base">Contrôles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isRecording ? (
                  <Button
                    onClick={startSimulation}
                    className="w-full bg-green-600 hover:bg-green-700 text-sm"
                    size="lg"
                  >
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Démarrer Live
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      onClick={togglePause}
                      variant="outline"
                      className="w-full border-gray-300 bg-transparent text-gray-700 text-sm"
                    >
                      {isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                      {isPaused ? "Reprendre" : "Pause"}
                    </Button>
                    <div className="space-y-2">
                      {aiError && <p className="text-xs text-red-600">{aiError}</p>}
                      {voiceMode && isListening && (
                        <p className="text-xs text-green-600">
                          🎙️ Je vous écoute… parlez, l&apos;envoi est automatique après un court silence.
                        </p>
                      )}
                      <Textarea
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            handleUserResponse()
                          }
                        }}
                        placeholder="Tapez ou dictez votre réponse..."
                        rows={3}
                        disabled={isPaused}
                        className="bg-white border-gray-300 text-gray-900 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={toggleDictation}
                          title={voiceMode ? "Désactiver la transcription vocale" : "Activer la transcription vocale"}
                          variant="outline"
                          className={`border-gray-300 bg-transparent ${voiceMode ? "text-green-600" : "text-gray-500"}`}
                        >
                          {voiceMode ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                        </Button>
                        <Button
                          onClick={() => handleUserResponse()}
                          disabled={isThinking || !userInput.trim()}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          {isThinking ? "Le client réfléchit..." : "Envoyer"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Indicateur de volume */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-gray-900 text-sm sm:text-base">
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Audio Live</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Progress value={volumeLevel} className="w-full" />
                  <p className="text-xs sm:text-sm text-gray-600">Niveau: {Math.round(volumeLevel)}%</p>
                  <div className="flex items-center space-x-2 text-xs">
                    <div className={`w-2 h-2 rounded-full ${volumeLevel > 10 ? "bg-green-400" : "bg-gray-500"}`}></div>
                    <span className="text-gray-500">Micro actif</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Émotions en temps réel */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-gray-900 text-sm sm:text-base">
                  <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                  <span>Analyse Live</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(emotions).map(([key, value]) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                      <span className="capitalize text-gray-600">{key}</span>
                      <span className={getEmotionColor(key === "stress" ? 100 - value : value)}>{Math.round(value)}%</span>
                    </div>
                    <Progress value={value} className="w-full h-2" />
                  </div>
                ))}
                <p className="text-xs text-gray-500">{voiceStatus}</p>
                {voiceTip && <p className="text-xs text-blue-600">💡 {voiceTip}</p>}
              </CardContent>
            </Card>

            {/* Conseils temps réel */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-gray-900 text-sm sm:text-base">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
                  <span>Coach Live</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-300">
                  <p className="text-xs sm:text-sm text-yellow-800">
                    💡{" "}
                    {emotions.stress > 60
                      ? "Respirez profondément. Prenez votre temps pour répondre."
                      : emotions.confidence < 50
                        ? "Maintenez le contact visuel. Votre expertise est précieuse."
                        : "Excellente posture ! Continuez à écouter activement."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}