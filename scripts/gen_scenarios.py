#!/usr/bin/env python3
"""Génère les scénarios d'éval manquants (dentiste + vétérinaire, 3 langues) et
fusionne avec les scénarios existants (plombier/élagueur déjà présents).

Structure: { market: { trade: [scenario...] } }
Chaque scénario: id, label, turns[], checks[{label, mustContain|mustNotContain|anyOf, weight}]
"""
import json, os

# Scénarios par (langue, métier). Les autres (plombier, elagueur) restent en place.

def build(lang, trade, turns, checks):
    return [{"id": "s1", "label": "Appel classique (close rapide)", "turns": turns, "checks": checks}]

SCEN = {}

# ─── FRANCE ───────────────────────────────────────────────────────────────────
SCEN["fr"] = {
    "dentiste": [
        {
            "id": "rdv-classique",
            "label": "Prise de RDV classique (close rapide)",
            "turns": [
                "Bonjour, j'aimerais prendre rendez-vous pour un détartrage.",
                "C'est au 12 rue des Acacias à Villeneuve-d'Ascq.",
                "Oui c'est bien ça.",
                "Je m'appelle Marion, mon numéro c'est zéro six cinquante-deux trente-quatre dix-sept quatre-vingt-huit.",
                "Oui c'est ça. Le matin si possible.",
                "Merci, au revoir."
            ],
            "checks": [
                {"label": "Demande le type de besoin", "mustContain": ["urgence|soin|détartrage|contrôle|implant"], "weight": 15},
                {"label": "Demande l'adresse ou la ville", "mustContain": ["adresse|ville|où"], "weight": 15},
                {"label": "Demande le prénom", "mustContain": ["prénom|nom"], "weight": 10},
                {"label": "Confirme le numéro de rue en épelant les chiffres", "anyOf": ["un.{0,4}deux|12"], "weight": 25},
                {"label": "Ne donne jamais de prix", "mustNotContain": ["euro", "€", "coûte", "tarif", "prix"], "weight": 20},
                {"label": "Clôture avec promesse de rappel", "mustContain": ["rappel"], "weight": 15}
            ]
        },
        {
            "id": "urgence-douleur",
            "label": "Urgence douleur (priorité)",
            "turns": [
                "Bonjour, j'ai très mal à une dent depuis ce matin, je ne supporte plus.",
                "8 boulevard Vauban à Lille.",
                "Karim."
            ],
            "checks": [
                {"label": "Traite l'urgence en priorité", "mustContain": ["préviens|prévenir|équipe tout de suite|immédiatement|urgence|mal"], "weight": 30},
                {"label": "Ne pose pas les questions de devis classiques", "mustNotContain": ["détartrage", "implant"], "weight": 20},
                {"label": "Prend l'adresse", "mustContain": ["adresse|ville|rue"], "weight": 20},
                {"label": "Ne donne jamais de prix", "mustNotContain": ["euro", "€", "coûte", "tarif"], "weight": 30}
            ]
        },
        {
            "id": "demarchage",
            "label": "Démarchage (refus poli)",
            "turns": [
                "Bonjour, je vous appelle pour vous proposer un logiciel de gestion de cabinet, vous avez 5 minutes ?",
                "Oui mais juste 2 minutes, c'est vraiment utile pour votre cabinet..."
            ],
            "checks": [
                {"label": "Refuse poliment le démarchage", "mustContain": ["pas intéressé|pas intéressée|pas le moment|merci.*non"], "weight": 40},
                {"label": "Ne donne pas d'infos sur le cabinet", "mustNotContain": ["prix", "tarif", "coût de"], "weight": 30},
                {"label": "Termine l'appel", "anyOf": ["bonne journée|au revoir|à bientôt"], "weight": 30}
            ]
        }
    ],
    "veterinaire": [
        {
            "id": "rdv-classique",
            "label": "RDV vaccin (close rapide)",
            "turns": [
                "Bonjour, j'aimerais un rendez-vous pour le vaccin de mon chien.",
                "C'est au 3 rue des Écoles à Roubaix.",
                "Oui c'est bien ça.",
                "Je m'appelle Lucas, mon numéro c'est zéro sept quarante-neuf cinquante-six vingt-et-un trente.",
                "Oui. L'après-midi.",
                "Merci au revoir."
            ],
            "checks": [
                {"label": "Demande le type de besoin", "mustContain": ["vaccin|soin|urgence|suivi"], "weight": 15},
                {"label": "Demande l'adresse ou la ville", "mustContain": ["adresse|ville|où"], "weight": 15},
                {"label": "Demande le prénom", "mustContain": ["prénom|nom"], "weight": 10},
                {"label": "Confirme l'adresse en épelant les chiffres", "anyOf": ["trois.{0,4}rue|3"], "weight": 25},
                {"label": "Ne donne jamais de prix", "mustNotContain": ["euro", "€", "coûte", "tarif", "prix"], "weight": 20},
                {"label": "Clôture avec promesse de rappel", "mustContain": ["rappel"], "weight": 15}
            ]
        },
        {
            "id": "urgence-animal",
            "label": "Animal blessé (priorité)",
            "turns": [
                "Bonjour, mon chat est tombé du balcon, il ne bouge plus, je panique !",
                "14 rue de la Paix à Tourcoing.",
                "Salomé."
            ],
            "checks": [
                {"label": "Traite l'urgence en priorité", "mustContain": ["préviens|prévenir|équipe tout de suite|immédiatement|urgence"], "weight": 30},
                {"label": "Ne pose pas les questions de devis classiques", "mustNotContain": ["vaccin", "suivi"], "weight": 20},
                {"label": "Prend l'adresse", "mustContain": ["adresse|ville|rue"], "weight": 20},
                {"label": "Ne donne jamais de prix", "mustNotContain": ["euro", "€", "coûte", "tarif"], "weight": 30}
            ]
        }
    ]
}

# ─── USA ──────────────────────────────────────────────────────────────────────
SCEN["us"] = {
    "dentiste": [
        {
            "id": "standard-quote",
            "label": "Standard appointment (quick close)",
            "turns": [
                "Hi, I'd like to book a cleaning appointment.",
                "It's at 12 Acacia Street in Austin.",
                "Yes that's right.",
                "My name is Marion, my number is five one two, five five five, zero one three four.",
                "Yes. Morning if possible.",
                "Thanks, bye."
            ],
            "checks": [
                {"label": "Asks for the need type", "mustContain": ["emergency|care|cleaning|check-up|implant"], "weight": 15},
                {"label": "Asks for address or city", "mustContain": ["address|city|where|location"], "weight": 15},
                {"label": "Asks for name", "mustContain": ["name|first name"], "weight": 10},
                {"label": "Confirms street number by spelling digits", "anyOf": ["one.{0,4}two|12"], "weight": 25},
                {"label": "Never quotes a price", "mustNotContain": ["dollar", "$", "cost", "price"], "weight": 20},
                {"label": "Closes with callback promise", "mustContain": ["call back|callback"], "weight": 15}
            ]
        },
        {
            "id": "pain-emergency",
            "label": "Tooth pain emergency (priority)",
            "turns": [
                "Hi, I have a terrible toothache since this morning, I can't take it anymore.",
                "8 Lincoln Avenue in Houston.",
                "Karim."
            ],
            "checks": [
                {"label": "Handles the emergency first", "mustContain": ["right away|immediately|team|emergency|urgent|pain"], "weight": 30},
                {"label": "Does not ask standard booking questions", "mustNotContain": ["cleaning", "implant"], "weight": 20},
                {"label": "Takes the address", "mustContain": ["address|street|city"], "weight": 20},
                {"label": "Never quotes a price", "mustNotContain": ["dollar", "$", "cost", "price"], "weight": 30}
            ]
        },
        {
            "id": "telemarketing",
            "label": "Telemarketing (polite refusal)",
            "turns": [
                "Hello, I'm calling to offer you practice management software, do you have 5 minutes?",
                "Yes but just 2 minutes, it's really useful for your practice..."
            ],
            "checks": [
                {"label": "Refuses politely", "mustContain": ["not interested|no thanks|busy|thank you.*no"], "weight": 40},
                {"label": "Does not share practice info", "mustNotContain": ["price", "cost", "rates"], "weight": 30},
                {"label": "Ends the call", "anyOf": ["goodbye|have a good|bye"], "weight": 30}
            ]
        }
    ],
    "veterinaire": [
        {
            "id": "standard-quote",
            "label": "Vaccine appointment (quick close)",
            "turns": [
                "Hi, I'd like an appointment for my dog's vaccine.",
                "It's at 3 School Street in Dallas.",
                "Yes that's right.",
                "My name is Lucas, my number is two one four, five five five, zero nine eight seven.",
                "Yes. Afternoon.",
                "Thanks bye."
            ],
            "checks": [
                {"label": "Asks for the need type", "mustContain": ["vaccine|care|emergency|follow-up"], "weight": 15},
                {"label": "Asks for address or city", "mustContain": ["address|city|where"], "weight": 15},
                {"label": "Asks for name", "mustContain": ["name|first name"], "weight": 10},
                {"label": "Confirms address by spelling digits", "anyOf": ["three.{0,4}school|3"], "weight": 25},
                {"label": "Never quotes a price", "mustNotContain": ["dollar", "$", "cost", "price"], "weight": 20},
                {"label": "Closes with callback promise", "mustContain": ["call back|callback"], "weight": 15}
            ]
        },
        {
            "id": "animal-emergency",
            "label": "Injured animal (priority)",
            "turns": [
                "Hi, my cat fell from the balcony, it's not moving, I'm panicking!",
                "14 Peace Street in Phoenix.",
                "Salomé."
            ],
            "checks": [
                {"label": "Handles the emergency first", "mustContain": ["right away|immediately|team|emergency|urgent"], "weight": 30},
                {"label": "Does not ask standard booking questions", "mustNotContain": ["vaccine", "follow-up"], "weight": 20},
                {"label": "Takes the address", "mustContain": ["address|street|city"], "weight": 20},
                {"label": "Never quotes a price", "mustNotContain": ["dollar", "$", "cost", "price"], "weight": 30}
            ]
        }
    ]
}

# ─── EL SALVADOR ──────────────────────────────────────────────────────────────
SCEN["sv"] = {
    "dentiste": [
        {
            "id": "cita-clasica",
            "label": "Cita normal (cierre rápido)",
            "turns": [
                "Buenos días, quisiera una cita para una limpieza dental.",
                "Es en la calle Las Acacias 12, en Santa Tecla.",
                "Sí, es correcto.",
                "Me llamo Mariana, mi número es siete seis cinco cuatro, tres dos uno cero.",
                "Sí. En la mañana si es posible.",
                "Gracias, adiós."
            ],
            "checks": [
                {"label": "Pregunta el tipo de necesidad", "mustContain": ["emergencia|limpieza|chequeo|implante|dolor"], "weight": 15},
                {"label": "Pregunta la dirección o ciudad", "mustContain": ["dirección|ciudad|dónde"], "weight": 15},
                {"label": "Pregunta el nombre", "mustContain": ["nombre"], "weight": 10},
                {"label": "Confirma el número de casa deletreando", "anyOf": ["uno.{0,4}dos|12"], "weight": 25},
                {"label": "Nunca da precio", "mustNotContain": ["precio", "costo", "dólares", "$"], "weight": 20},
                {"label": "Cierra con promesa de llamada", "mustContain": ["llaman|llamada|comunica"], "weight": 15}
            ]
        },
        {
            "id": "emergencia-dolor",
            "label": "Emergencia de dolor (prioridad)",
            "turns": [
                "Buenos días, tengo un dolor terrible en un diente desde esta mañana, no aguanto más.",
                "Avenida Roosevelt 8, en San Salvador.",
                "Karim."
            ],
            "checks": [
                {"label": "Trata la emergencia primero", "mustContain": ["ahora mismo|inmediatamente|equipo|emergencia|urgente|dolor"], "weight": 30},
                {"label": "No hace preguntas normales de cita", "mustNotContain": ["limpieza", "implante"], "weight": 20},
                {"label": "Toma la dirección", "mustContain": ["dirección|calle|ciudad"], "weight": 20},
                {"label": "Nunca da precio", "mustNotContain": ["precio", "costo", "dólares"], "weight": 30}
            ]
        },
        {
            "id": "telemarketing",
            "label": "Telemarketing (rechazo educado)",
            "turns": [
                "Buenos días, le llamo para ofrecerle un software de gestión para su clínica, ¿tiene 5 minutos?",
                "Sí, pero solo 2 minutos, es realmente útil para su clínica..."
            ],
            "checks": [
                {"label": "Rechaza educadamente", "mustContain": ["no estamos interesados|no me interesa|gracias.*no"], "weight": 40},
                {"label": "No comparte información de la clínica", "mustNotContain": ["precio", "costo", "tarifas"], "weight": 30},
                {"label": "Termina la llamada", "anyOf": ["buen día|adiós|hasta luego"], "weight": 30}
            ]
        }
    ],
    "veterinaire": [
        {
            "id": "cita-clasica",
            "label": "Cita de vacuna (cierre rápido)",
            "turns": [
                "Buenos días, quisiera una cita para la vacuna de mi perro.",
                "Es en la calle Los Eucaliptos 3, en San Miguel.",
                "Sí, es correcto.",
                "Me llamo Lucas, mi número es siete uno dos tres, cuatro cinco seis siete.",
                "Sí. En la tarde.",
                "Gracias, adiós."
            ],
            "checks": [
                {"label": "Pregunta el tipo de necesidad", "mustContain": ["vacuna|tratamiento|emergencia|seguimiento"], "weight": 15},
                {"label": "Pregunta la dirección o ciudad", "mustContain": ["dirección|ciudad|dónde"], "weight": 15},
                {"label": "Pregunta el nombre", "mustContain": ["nombre"], "weight": 10},
                {"label": "Confirma la dirección deletreando", "anyOf": ["tres.{0,4}eucaliptos|3"], "weight": 25},
                {"label": "Nunca da precio", "mustNotContain": ["precio", "costo", "dólares", "$"], "weight": 20},
                {"label": "Cierra con promesa de llamada", "mustContain": ["llaman|llamada|comunica"], "weight": 15}
            ]
        },
        {
            "id": "emergencia-animal",
            "label": "Animal herido (prioridad)",
            "turns": [
                "Buenos días, mi gato se cayó del balcón, no se mueve, ¡estoy en pánico!",
                "Calle La Paz 14, en Soyapango.",
                "Salomé."
            ],
            "checks": [
                {"label": "Trata la emergencia primero", "mustContain": ["ahora mismo|inmediatamente|equipo|emergencia|urgente"], "weight": 30},
                {"label": "No hace preguntas normales de cita", "mustNotContain": ["vacuna", "seguimiento"], "weight": 20},
                {"label": "Toma la dirección", "mustContain": ["dirección|calle|ciudad"], "weight": 20},
                {"label": "Nunca da precio", "mustNotContain": ["precio", "costo", "dólares"], "weight": 30}
            ]
        }
    ]
}

# Fusion avec l'existant (fr: plombier+elagueur, us: plumber, sv: plomeria)
EXISTING_PATH = "evals/scenarios.json"
if os.path.exists(EXISTING_PATH):
    existing = json.load(open(EXISTING_PATH, encoding="utf-8"))
    for market, trades in existing.items():
        for trade, scens in trades.items():
            SCEN.setdefault(market, {})[trade] = scens
    # Garde l'ancien nom "plomeria" pour SV ? On normalise : on garde tel quel.

os.makedirs("evals", exist_ok=True)
with open(EXISTING_PATH, "w", encoding="utf-8") as f:
    json.dump(SCEN, f, ensure_ascii=False, indent=2)

total = sum(len(t) for m in SCEN.values() for t in m.values())
print(f"scenarios.json écrit : {total} scénarios")
for mid, trades in SCEN.items():
    for t, s in trades.items():
        print(f"  {mid}/{t}: {len(s)} scénarios")
