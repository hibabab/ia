"use client"

import { useEffect, useState } from "react"

export type AvatarLook = {
  skin: string
  hair: string
  hairStyle: "short" | "bob" | "long"
  shirt: string
  collar: string
  glasses?: boolean
  gender: "female" | "male"
}

// Un personnage par client (clé = clientId de la page de simulation)
export const AVATAR_LOOKS: Record<string, AvatarLook> = {
  millesimal: { gender: "female", skin: "#e8b894", hair: "#4a2c1a", hairStyle: "long", shirt: "#7b1f3a", collar: "#f5f5f5" },
  altyn: { gender: "female", skin: "#f1c9a5", hair: "#d9b66a", hairStyle: "bob", shirt: "#1f7a7a", collar: "#f5f5f5" },
  bouygues: { gender: "male", skin: "#d9a47c", hair: "#2a2118", hairStyle: "short", shirt: "#1d2f55", collar: "#f5f5f5" },
  bpi: { gender: "male", skin: "#e8b894", hair: "#b8b8b8", hairStyle: "short", shirt: "#3a3f47", collar: "#f5f5f5" },
  distalmotion: { gender: "male", skin: "#c98e68", hair: "#3b2a1e", hairStyle: "short", shirt: "#eef2f5", collar: "#6b8fb3", glasses: true },
  loreal: { gender: "female", skin: "#f1c9a5", hair: "#a8341c", hairStyle: "long", shirt: "#c2457a", collar: "#f5f5f5" },
}

type Emotion = "neutral" | "happy" | "concerned" | "excited" | "thinking"

const BROWS: Record<Emotion, { l: string; r: string }> = {
  neutral: { l: "M74 79 Q84 75 94 79", r: "M106 79 Q116 75 126 79" },
  happy: { l: "M74 77 Q84 71 94 77", r: "M106 77 Q116 71 126 77" },
  excited: { l: "M74 76 Q84 70 94 76", r: "M106 76 Q116 70 126 76" },
  concerned: { l: "M74 82 Q84 76 94 73", r: "M106 73 Q116 76 126 82" },
  thinking: { l: "M74 79 Q84 75 94 79", r: "M106 72 Q116 68 126 74" },
}

const SMILES: Record<Emotion, string> = {
  neutral: "M91 122 Q100 126 109 122",
  happy: "M88 120 Q100 131 112 120",
  excited: "M88 120 Q100 132 112 120",
  concerned: "M91 125 Q100 120 109 125",
  thinking: "M92 123 L108 121",
}

const HAIR_BACK: Record<AvatarLook["hairStyle"], string | null> = {
  short: null,
  bob: "M50 100 Q40 38 100 36 Q160 38 150 100 L152 130 Q100 140 48 130 Z",
  long: "M50 100 Q40 38 100 36 Q160 38 150 100 L158 185 Q100 195 42 185 Z",
}

const HAIR_FRONT: Record<AvatarLook["hairStyle"], string> = {
  short: "M55 88 Q52 38 100 38 Q148 38 145 88 Q138 62 118 58 Q100 66 80 58 Q62 62 55 88 Z",
  bob: "M54 92 Q56 44 100 42 Q146 44 146 92 Q130 60 104 62 Q76 62 54 92 Z",
  long: "M54 92 Q56 44 100 42 Q146 44 146 92 Q130 60 104 62 Q76 62 54 92 Z",
}

// Ouverture de la bouche pendant la parole (valeurs entre 0 = fermée et 1 = grande ouverte)
const MOUTH_SHAPES = [0.15, 0.55, 0.9, 0.3, 0.7, 0.05, 0.8, 0.4]

export default function TalkingAvatar({
  look,
  speaking,
  thinking = false,
  emotion = "neutral",
  className = "",
}: {
  look: AvatarLook
  speaking: boolean
  thinking?: boolean
  emotion?: Emotion
  className?: string
}) {
  const [open, setOpen] = useState(0)
  const [blink, setBlink] = useState(false)

  // Bouche : bouge tant que le client parle
  useEffect(() => {
    if (!speaking) {
      setOpen(0)
      return
    }
    const id = setInterval(() => {
      setOpen(MOUTH_SHAPES[Math.floor(Math.random() * MOUTH_SHAPES.length)])
    }, 110)
    return () => clearInterval(id)
  }, [speaking])

  // Clignement des yeux
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const schedule = () => {
      timeout = setTimeout(() => {
        setBlink(true)
        setTimeout(() => {
          setBlink(false)
          schedule()
        }, 140)
      }, 2500 + Math.random() * 2500)
    }
    schedule()
    return () => clearTimeout(timeout)
  }, [])

  const brows = BROWS[thinking ? "thinking" : emotion]
  const eyeRy = blink ? 0.8 : 6.5
  const bob = speaking ? -open * 1.5 : 0
  const lip = look.gender === "female" ? "#c2455a" : "#a0453f"

  return (
    <svg
      viewBox="0 0 200 220"
      preserveAspectRatio="xMidYMax meet"
      className={className}
      role="img"
      aria-label="Avatar du client"
    >
      <g style={{ transform: `translateY(${bob}px)`, transition: "transform 0.1s" }}>
        {/* Cheveux (arrière) */}
        {HAIR_BACK[look.hairStyle] && <path d={HAIR_BACK[look.hairStyle]!} fill={look.hair} />}

        {/* Buste */}
        <path d="M10 220 Q14 168 100 162 Q186 168 190 220 Z" fill={look.shirt} />
        <polygon points="84,162 100,188 116,162" fill={look.collar} />

        {/* Cou */}
        <rect x="88" y="132" width="24" height="34" fill={look.skin} />
        <rect x="88" y="132" width="24" height="34" fill="#000" opacity="0.08" />

        {/* Oreilles */}
        <circle cx="56" cy="100" r="8" fill={look.skin} />
        <circle cx="144" cy="100" r="8" fill={look.skin} />

        {/* Visage */}
        <ellipse cx="100" cy="95" rx="44" ry="52" fill={look.skin} />

        {/* Cheveux (avant) */}
        <path d={HAIR_FRONT[look.hairStyle]} fill={look.hair} />

        {/* Yeux */}
        <ellipse cx="84" cy="92" rx="7" ry={eyeRy} fill="#fff" />
        <ellipse cx="116" cy="92" rx="7" ry={eyeRy} fill="#fff" />
        {!blink && (
          <>
            <circle cx="84" cy="92" r="3.5" fill="#2b1d14" />
            <circle cx="116" cy="92" r="3.5" fill="#2b1d14" />
          </>
        )}

        {/* Lunettes */}
        {look.glasses && (
          <g fill="none" stroke="#222" strokeWidth="2">
            <circle cx="84" cy="92" r="12" />
            <circle cx="116" cy="92" r="12" />
            <line x1="96" y1="92" x2="104" y2="92" />
          </g>
        )}

        {/* Détails femme : cils et boucles d'oreilles */}
        {look.gender === "female" && (
          <>
            <g stroke="#2b1d14" strokeWidth="1.8" strokeLinecap="round" fill="none">
              <path d="M76 87 Q84 82 92 87" />
              <path d="M108 87 Q116 82 124 87" />
            </g>
            <circle cx="56" cy="110" r="3" fill="#e8c14a" />
            <circle cx="144" cy="110" r="3" fill="#e8c14a" />
          </>
        )}

        {/* Détail homme : ombre de barbe */}
        {look.gender === "male" && (
          <path d="M60 105 Q62 146 100 147 Q138 146 140 105 Q120 128 100 128 Q80 128 60 105 Z" fill="#000" opacity="0.07" />
        )}

        {/* Sourcils */}
        <path d={brows.l} fill="none" stroke={look.hair} strokeWidth={look.gender === "male" ? 4 : 2.5} strokeLinecap="round" />
        <path d={brows.r} fill="none" stroke={look.hair} strokeWidth={look.gender === "male" ? 4 : 2.5} strokeLinecap="round" />

        {/* Nez */}
        <path d="M100 98 Q96 110 100 112" fill="none" stroke="#000" opacity="0.25" strokeWidth="2" strokeLinecap="round" />

        {/* Bouche */}
        {speaking && open > 0.1 ? (
          <ellipse
            cx="100"
            cy="123"
            rx={8 + open * 3}
            ry={1.5 + open * 8}
            fill="#6b1f24"
            stroke={lip}
            strokeWidth="2"
          />
        ) : (
          <path d={SMILES[emotion]} fill="none" stroke={lip} strokeWidth="3" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}
