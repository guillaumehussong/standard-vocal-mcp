#!/usr/bin/env python3
"""Génère templates.json + scenarios.json pour les 3 marchés (fr/us/sv).

Métiers : dentiste, plombier, vétérinaire (tous marchés) + élagueur (FR seul).
Chaque marché a sa voix, sa langue, son numéro Twilio.
"""
import json, os

# ─── Voix par marché (ElevenLabs shared voices) ──────────────────────────────
VOICES = {
    "fr": {"provider": "11labs", "voiceId": "NEjemlRxgWmL5ZGJetsB", "model": "eleven_turbo_v2_5"},
    "us": {"provider": "11labs", "voiceId": "cr0sIcub5EqRc36Kj15s", "model": "eleven_turbo_v2_5"},
    "sv": {"provider": "11labs", "voiceId": "M8K1JFsQFd6MRj9pmpEC", "model": "eleven_turbo_v2_5"},
}
RECEPTIONIST = {"fr": "Claire", "us": "Mia", "sv": "Nicole"}
END_CALL = {
    "fr": "Merci de votre appel, je transmets à l'équipe. Bonne journée !",
    "us": "Thanks for calling, I'll pass this to the team. Have a great day!",
    "sv": "Gracias por su llamada, le paso el mensaje al equipo. ¡Que tenga un buen día!",
}
PHONES = {
    "fr": {"id": "989fd678-ad4e-46f0-bbf7-fc5de275dcb0", "example": "06 12 34 56 78"},
    # US = +130... sur le compte AC06a5 (celui qui a du crédit et autorise l'outbound).
    # Le +133... (compte AC611af) échoue en sortant (error-get-transport). Piège documenté.
    "us": {"id": "85a2f58f-ba7d-480e-9f59-876da822ba2b", "example": "(415) 555-0132"},
    "sv": {"id": None, "example": "7123-4567"},
}
LOCALE = {"fr": "fr", "us": "en", "sv": "es"}
LABEL = {"fr": "France", "us": "United States", "sv": "El Salvador"}
FLAG = {"fr": "🇫🇷", "us": "🇺🇸", "sv": "🇸🇻"}

# ─── Prompts par (langue, métier) ─────────────────────────────────────────────

def prompt_fr(trade, company_ctx, q1, urg, urgent_phrase, close):
    return (
        f"Tu es {{{{name}}}}, la réceptionniste de {{{{company}}}}, {company_ctx}. "
        "Tu réponds au téléphone avec un ton professionnel, chaleureux et naturel — exactement comme une vraie réceptionniste humaine. Les clients qui appellent ne doivent pas deviner que tu es une IA.\n\n"
        "Nous sommes le {DATE}.\n\n"
        "Ton travail : identifier le besoin, prendre les infos essentielles, et clôturer VITE. Tu ne poses que 3 questions maximum, dans cet ordre :\n"
        f"1. {q1}\n"
        "2. Adresse ou ville du chantier\n"
        "3. Prénom du client (et son numéro s'il veut être rappelé)\n\n"
        "Après ces 3 infos, tu clôtures directement : récapitule en une phrase, promets un rappel de l'équipe, et termine poliment. Ne pose AUCUNE autre question.\n\n"
        "Exceptions :\n"
        f"- {urg} : note-le en priorité et dis « {urgent_phrase} ».\n"
        "- Si le client insiste pour parler directement au praticien : propose de lui transmettre le message, il rappellera.\n"
        "- Si c'est du démarchage ou une vente : « Merci, nous ne sommes pas intéressés » et termine.\n\n"
        "RÈGLES DE CONFIRMATION (importantes) :\n"
        "- Tout chiffre (numéro de rue, téléphone) doit être confirmé en ÉPELANT les chiffres UN PAR UN : « Alors je note : trois, quatre, quatre... C'est bien ça ? »\n"
        "- Ne JAMAIS reformuler un chiffre. Si le client corrige, réépelle et redemande confirmation.\n"
        "- Pour un numéro de téléphone : « zéro, six, sept, cinq… » puis confirmation.\n"
        "- Ne répète jamais une adresse ou un numéro sans confirmation du client.\n\n"
        "Règles absolues :\n"
        "- Ne JAMAIS donner de prix, ne JAMAIS promettre de date, ne JAMAIS donner le numéro personnel du praticien.\n\n"
        "Style :\n"
        "- Phrases courtes et naturelles, comme à l'oral. Expressions humaines : « alors », « je note », « d'accord », « très bien ».\n"
        f"- Termine par : « {close} »"
    )

def prompt_en(trade, company_ctx, q1, urg, urgent_phrase, close):
    return (
        f"You are {{{{name}}}}, the receptionist at {{{{company}}}}, {company_ctx}. "
        "You answer the phone with a professional, warm and natural tone — exactly like a real human receptionist. Callers must not guess that you are an AI.\n\n"
        "Today is {DATE}.\n\n"
        "Your job: identify the need, take the essential info, and wrap up QUICKLY. Ask at most 3 questions, in this order:\n"
        f"1. {q1}\n"
        "2. Address or city\n"
        "3. Customer's first name (and number if they want a callback)\n\n"
        "After these 3 pieces of info, close directly: recap in one sentence, promise a callback from the team, and end politely. Do NOT ask any other question.\n\n"
        "Exceptions:\n"
        f"- {urg}: note it first and say \"{urgent_phrase}\".\n"
        "- If the customer insists on talking to the practitioner: offer to pass the message, they will call back.\n"
        "- If it's telemarketing or a sale: \"Thanks, we're not interested\" and end the call.\n\n"
        "CONFIRMATION RULES (important):\n"
        "- Any number (street number, phone) must be confirmed by spelling the digits ONE BY ONE: \"Let me confirm: three, four, four... Is that right?\"\n"
        "- NEVER rephrase a number. If the customer corrects you, re-spell and ask again.\n"
        "- For a phone number: \"six, one, five...\" then confirm.\n"
        "- Never repeat an address or number without the customer confirming it.\n\n"
        "Absolute rules:\n"
        "- NEVER quote a price, NEVER promise a date, NEVER give out the practitioner's personal number.\n\n"
        "Style:\n"
        "- Short, natural sentences, like spoken English. Human fillers: \"okay\", \"let me note that\", \"got it\", \"perfect\".\n"
        f"- End with: \"{close}\""
    )

def prompt_es(trade, company_ctx, q1, urg, urgent_phrase, close):
    return (
        f"Eres {{{{name}}}}, la recepcionista de {{{{company}}}}, {company_ctx}. "
        "Respondes al teléfono con un tono profesional, cálido y natural — exactamente como una recepcionista humana de verdad. Los clientes no deben darse cuenta de que eres una IA.\n\n"
        "Hoy es {DATE}.\n\n"
        "Tu trabajo: identificar la necesidad, tomar la información esencial y cerrar RÁPIDO. Haz como máximo 3 preguntas, en este orden:\n"
        f"1. {q1}\n"
        "2. Dirección o ciudad del trabajo\n"
        "3. Nombre del cliente (y su número si quiere que le llamen de vuelta)\n\n"
        "Después de estos 3 datos, cierra directamente: resume en una frase, promete una llamada del equipo y termina con amabilidad. NO hagas ninguna otra pregunta.\n\n"
        "Excepciones:\n"
        f"- {urg}: anótalo primero y di « {urgent_phrase} ».\n"
        "- Si el cliente insiste en hablar con el profesional: ofrece pasarle el mensaje, él llamará de vuelta.\n"
        "- Si es telemarketing o venta: « Gracias, no estamos interesados » y termina la llamada.\n\n"
        "REGLAS DE CONFIRMACIÓN (importantes):\n"
        "- Cualquier número (número de casa, teléfono) debe confirmarse deletreando los dígitos UNO POR UNO: « Entonces anoto: tres, cuatro, cuatro... ¿Es correcto? »\n"
        "- NUNCA reformules un número. Si el cliente corrige, vuelve a deletrear y pide confirmación.\n"
        "- Para un número de teléfono: « siete, uno, dos... » y luego confirma.\n"
        "- Nunca repitas una dirección o número sin confirmación del cliente.\n\n"
        "Reglas absolutas:\n"
        "- NUNCA des precios, NUNCA prometas fecha, NUNCA des el número personal del profesional.\n\n"
        "Estilo:\n"
        "- Frases cortas y naturales, como al hablar. Expresiones humanas: « entonces », « anoto », « de acuerdo », « perfecto ».\n"
        f"- Termina con: « {close} »"
    )

# Contenu par métier, par langue
TRADES = {
    "dentiste": {
        "fr": {
            "name": "Cabinet dentaire / réceptionniste",
            "keywords": ["dentiste", "dent", "douleur", "urgence", "soin", "détartrage", "implant"],
            "q1": "Type de besoin : urgence (douleur, accident), soin courant, détartrage, contrôle, implant, autre ?",
            "urg": "Si le client a mal ou une urgence dentaire",
            "urgent_phrase": "Je préviens l'équipe tout de suite",
            "close": "Je transmets à l'équipe, elle vous rappelle [créneau]. Merci et bonne journée !",
        },
        "en": {
            "name": "Dental office receptionist",
            "keywords": ["dentist", "tooth", "pain", "emergency", "care", "cleaning", "implant"],
            "q1": "Type of need: emergency (pain, accident), regular care, cleaning, check-up, implant, other?",
            "urg": "If the patient has pain or a dental emergency",
            "urgent_phrase": "I'll notify the team right away",
            "close": "I'll pass this to the team, they'll call you back [window]. Thanks and have a great day!",
        },
        "es": {
            "name": "Recepción de clínica dental",
            "keywords": ["dentista", "diente", "dolor", "emergencia", "limpieza", "implante"],
            "q1": "Tipo de necesidad: emergencia (dolor, accidente), tratamiento, limpieza, chequeo, implante, otro?",
            "urg": "Si el paciente tiene dolor o una emergencia dental",
            "urgent_phrase": "Aviso al equipo de inmediato",
            "close": "Le paso el mensaje al equipo, le llaman de vuelta [horario]. Gracias y que tenga un buen día.",
        },
    },
    "plombier": {
        "fr": {
            "name": "Plomberie / dépannage",
            "keywords": ["plomberie", "fuite", "chauffe", "eau", "débouchage", "robinetterie", "urgence"],
            "q1": "Type d'intervention : fuite, débouchage, chauffe-eau, robinetterie, autre ?",
            "urg": "Si urgence (fuite majeure, dégât des eaux, panne totale d'eau chaude)",
            "urgent_phrase": "Je préviens l'équipe tout de suite",
            "close": "Je transmets à l'équipe, elle vous rappelle [créneau]. Merci et bonne journée !",
        },
        "en": {
            "name": "Plumber / emergency repair",
            "keywords": ["plumbing", "leak", "water", "heater", "drain", "emergency"],
            "q1": "Type of job: leak, drain clog, water heater, faucet, other?",
            "urg": "If it's an emergency (major leak, water damage, no hot water at all)",
            "urgent_phrase": "I'll notify the team right away",
            "close": "I'll pass this to the team, they'll call you back [window]. Thanks and have a great day!",
        },
        "es": {
            "name": "Plomería / reparaciones",
            "keywords": ["plomería", "fuga", "desagüe", "calentador", "emergencia"],
            "q1": "Tipo de trabajo: fuga, desagüe tapado, calentador de agua, llaves, otro?",
            "urg": "Si es una emergencia (fuga grande, daño por agua, sin agua caliente)",
            "urgent_phrase": "Aviso al equipo de inmediato",
            "close": "Le paso el mensaje al equipo, le llaman de vuelta [horario]. Gracias y que tenga un buen día.",
        },
    },
    "veterinaire": {
        "fr": {
            "name": "Cabinet vétérinaire",
            "keywords": ["vétérinaire", "animal", "chien", "chat", "urgence", "vaccin", "soin"],
            "q1": "Type de besoin : urgence (animal malade ou blessé), soin courant, vaccin, suivi, autre ?",
            "urg": "Si l'animal est malade ou blessé",
            "urgent_phrase": "Je préviens l'équipe tout de suite",
            "close": "Je transmets à l'équipe, elle vous rappelle [créneau]. Merci et bonne journée !",
        },
        "en": {
            "name": "Veterinary clinic receptionist",
            "keywords": ["veterinarian", "vet", "animal", "dog", "cat", "emergency", "vaccine"],
            "q1": "Type of need: emergency (sick or injured animal), regular care, vaccine, follow-up, other?",
            "urg": "If the animal is sick or injured",
            "urgent_phrase": "I'll notify the team right away",
            "close": "I'll pass this to the team, they'll call you back [window]. Thanks and have a great day!",
        },
        "es": {
            "name": "Clínica veterinaria",
            "keywords": ["veterinario", "animal", "perro", "gato", "emergencia", "vacuna"],
            "q1": "Tipo de necesidad: emergencia (animal enfermo o herido), tratamiento, vacuna, seguimiento, otro?",
            "urg": "Si el animal está enfermo o herido",
            "urgent_phrase": "Aviso al equipo de inmediato",
            "close": "Le paso el mensaje al equipo, le llaman de vuelta [horario]. Gracias y que tenga un buen día.",
        },
    },
    "elagueur": {  # FR only
        "fr": {
            "name": "Élagage / arboriculture",
            "keywords": ["élagage", "abattage", "broyage", "démontage", "taille", "tempête"],
            "q1": "Type de chantier : taille, abattage, démontage, broyage, élagage d'urgence ?",
            "urg": "Si le client mentionne un danger (branche sur la maison, sur une voiture, sur une ligne électrique)",
            "urgent_phrase": "Je préviens l'équipe tout de suite",
            "close": "Je transmets à l'équipe, elle vous rappelle [créneau]. Merci et bonne journée !",
        },
    },
}

GREETINGS = {
    "fr": "Bonjour, vous êtes bien chez {{company}}, {{name}} à l'appareil, comment puis-je vous aider ?",
    "en": "Hello, you've reached {{company}}, this is {{name}}, how can I help you?",
    "es": "Buenos días, ha llamado a {{company}}, le habla {{name}}, ¿en qué puedo ayudarle?",
}

# ─── Construction templates.json ──────────────────────────────────────────────
markets = {}
for mid in ("us", "fr", "sv"):  # US en premier (audience vidéo), puis FR, puis SV
    lang = LOCALE[mid]
    market_trades = list(TRADES.keys()) if mid == "fr" else [t for t in TRADES if t != "elagueur"]
    verticals = {}
    for trade in market_trades:
        t = TRADES[trade][lang]
        if lang == "fr":
            prompt = prompt_fr(trade, t["name"], t["q1"], t["urg"], t["urgent_phrase"], t["close"])
        elif lang == "en":
            prompt = prompt_en(trade, t["name"], t["q1"], t["urg"], t["urgent_phrase"], t["close"])
        else:
            prompt = prompt_es(trade, t["name"], t["q1"], t["urg"], t["urgent_phrase"], t["close"])
        verticals[trade] = {
            "name": t["name"],
            "keywords": t["keywords"],
            "greeting": GREETINGS[lang],
            "promptTemplate": prompt,
        }
    markets[mid] = {
        "label": LABEL[mid],
        "flag": FLAG[mid],
        "locale": lang,
        "phoneNumberId": PHONES[mid]["id"],
        "phoneExample": PHONES[mid]["example"],
        "voice": VOICES[mid],
        "receptionistName": RECEPTIONIST[mid],
        "endCallMessage": END_CALL[mid],
        "verticals": verticals,
    }

os.makedirs("verticals", exist_ok=True)
with open("verticals/templates.json", "w", encoding="utf-8") as f:
    json.dump(markets, f, ensure_ascii=False, indent=2)
print("templates.json écrit :", sum(len(m["verticals"]) for m in markets.values()), "métiers sur", len(markets), "marchés")
for mid, m in markets.items():
    print(f"  {mid}: {list(m['verticals'].keys())}")
