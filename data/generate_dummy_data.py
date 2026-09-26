"""Generate a small, referentially consistent dummy copy of the LATAM Bank dataset.

Mirrors the schema in data/pipeline/tables.py (Factored Datathon 2026 data
dictionary) and the known data-quality traits of the real dataset: ~2% duplicate
rows and ~5% nulls in nullable columns. Output is one CSV per table so the
pipeline ingests dummy and real data through the same path.

Usage:
    python data/generate_dummy_data.py [--out data/dummy_output] [--scale 1.0] [--seed 42]
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "pipeline"))
from tables import TABLES  # noqa: E402

START = datetime(2023, 6, 17)
END = datetime(2026, 6, 17)

COUNTRIES = {
    "Mexico": {
        "currency": "MXN", "accent": "mexican", "doc_types": ["CURP", "Passport"],
        "usd_rate": (0.050, 0.060), "phone": "+52",
        "places": [("Ciudad de México", "CDMX", 19.4326, -99.1332), ("Guadalajara", "Jalisco", 20.6597, -103.3496),
                   ("Monterrey", "Nuevo León", 25.6866, -100.3161), ("Puebla", "Puebla", 19.0414, -98.2063)],
        "first": ["José", "María", "Guadalupe", "Juan", "Fernanda", "Luis", "Ximena", "Alejandro", "Daniela", "Miguel"],
        "last": ["Hernández", "García", "Martínez", "López", "González", "Rodríguez", "Pérez", "Sánchez", "Ramírez", "Flores"],
    },
    "Colombia": {
        "currency": "COP", "accent": "colombian", "doc_types": ["CC", "CE", "Passport"],
        "usd_rate": (0.00023, 0.00027), "phone": "+57",
        "places": [("Bogotá", "Cundinamarca", 4.7110, -74.0721), ("Medellín", "Antioquia", 6.2442, -75.5812),
                   ("Cali", "Valle del Cauca", 3.4516, -76.5320), ("Barranquilla", "Atlántico", 10.9685, -74.7813)],
        "first": ["Andrés", "Valentina", "Santiago", "Camila", "Juan Pablo", "Mariana", "Sebastián", "Laura", "Felipe", "Natalia"],
        "last": ["Rodríguez", "Gómez", "Martínez", "Ramírez", "Castro", "Vargas", "Moreno", "Jiménez", "Rojas", "Ortiz"],
    },
    "Argentina": {
        "currency": "ARS", "accent": "argentine", "doc_types": ["DNI", "Passport"],
        "usd_rate": (0.00085, 0.0029), "phone": "+54",
        "places": [("Buenos Aires", "CABA", -34.6037, -58.3816), ("Córdoba", "Córdoba", -31.4201, -64.1888),
                   ("Rosario", "Santa Fe", -32.9442, -60.6505), ("Mendoza", "Mendoza", -32.8895, -68.8458)],
        "first": ["Martín", "Sofía", "Facundo", "Lucía", "Nicolás", "Agustina", "Joaquín", "Florencia", "Tomás", "Milagros"],
        "last": ["González", "Fernández", "López", "Díaz", "Romero", "Álvarez", "Benítez", "Acosta", "Sosa", "Medina"],
    },
}

PRODUCT_TYPES = ["Checking Account", "Savings Account", "Credit Card", "Debit Card", "Personal Loan", "Mortgage", "Investment"]
CREDIT_PRODUCTS = {"Credit Card", "Personal Loan", "Mortgage"}
SEGMENTS = ["Premium", "Plus", "Basic", "Student"]
CONTACT_REASONS = {
    "Transactional": ["Cargo no reconocido", "Transferencia no recibida", "Consulta de saldo", "Reverso de pago"],
    "Product": ["Aumento de límite de crédito", "Bloqueo de tarjeta", "Apertura de cuenta", "Cancelación de producto"],
    "Technical": ["Error en la app", "Olvido de contraseña", "Token bloqueado"],
    "Commercial": ["Información de préstamo", "Tasas de inversión", "Beneficios de tarjeta"],
    "Complaint": ["Cobro de comisión indebida", "Mala atención en sucursal", "Demora en reclamo"],
}
GREETING = {
    "mexican": ("Buenas tardes, ¿en qué le puedo ayudar?", "Oiga, fíjese que", "¡Órale, muchas gracias!"),
    "colombian": ("Buenas tardes, ¿en qué le puedo colaborar?", "Mire, lo que pasa es que", "¡Listo, muchas gracias, qué pena con usted!"),
    "argentine": ("Buenas tardes, ¿en qué te puedo ayudar?", "Mirá, te cuento que", "¡Dale, genial, muchas gracias!"),
}
MERCHANTS = {"Food": ["Oxxo", "Éxito", "Carrefour", "Rappi"], "Transport": ["Uber", "DiDi", "YPF", "Pemex"],
             "Services": ["Telmex", "Claro", "Personal", "EPM"], "Entertainment": ["Netflix", "Spotify", "Cinépolis"],
             "Health": ["Farmacias del Ahorro", "Farmatodo", "Farmacity"], "Other": ["Mercado Libre", "Amazon"]}

rng = random.Random()


def rand_dt(start: datetime = START, end: datetime = END) -> datetime:
    return start + timedelta(seconds=rng.randint(0, int((end - start).total_seconds())))


def money(lo: float, hi: float) -> Decimal:
    return Decimal(str(round(rng.uniform(lo, hi), 2)))


def maybe(p: float, value):
    return value if rng.random() < p else None


class Ids:
    def __init__(self, prefix: str, width: int = 8):
        self.prefix, self.width, self.n = prefix, width, 0

    def __call__(self) -> str:
        self.n += 1
        return f"{self.prefix}{self.n:0{self.width}d}"


def usd_rate(country: str, d: date) -> float:
    lo, hi = COUNTRIES[country]["usd_rate"]
    frac = (datetime.combine(d, time()) - START).days / (END - START).days
    # ARS depreciates over time; MXN/COP just oscillate.
    base = hi - (hi - lo) * frac if country == "Argentina" else (lo + hi) / 2
    return round(base * rng.uniform(0.98, 1.02), 6)


def generate(scale: float) -> dict[str, list[dict]]:
    n = lambda base: max(1, int(base * scale))  # noqa: E731
    data: dict[str, list[dict]] = {name: [] for name in TABLES}

    # --- exchange rates (full history, same as real reference table) -------
    rates: dict[tuple[date, str], float] = {}
    d = START.date()
    while d <= END.date():
        for country, cfg in COUNTRIES.items():
            r = usd_rate(country, d)
            rates[(d, cfg["currency"])] = r
            data["daily_exchange_rates"].append({
                "date": d, "source_currency": cfg["currency"], "target_currency": "USD", "exchange_rate": r,
                "buy_rate": round(r * 0.985, 6), "sell_rate": round(r * 1.015, 6), "source": "Banco Central",
            })
        d += timedelta(days=1)

    def to_usd(amount: Decimal, currency: str, d: date) -> Decimal:
        rate = 1.0 if currency == "USD" else rates[(d, currency)]
        return Decimal(str(round(float(amount) * rate, 2)))

    # --- branches -----------------------------------------------------------
    branch_id = Ids("BR", 5)
    branches_by_country: dict[str, list[dict]] = {c: [] for c in COUNTRIES}
    for _ in range(n(30)):
        country = rng.choice(list(COUNTRIES))
        city, state, lat, lon = rng.choice(COUNTRIES[country]["places"])
        bid = branch_id()
        has_atms = rng.random() < 0.85
        row = {
            "branch_id": bid, "branch_code": f"S{bid[2:]}", "branch_name": f"Sucursal {city} {bid[-3:]}",
            "branch_type": rng.choice(["Main", "Express", "Premium", "Corporate"]),
            "address": f"Av. Principal {rng.randint(1, 999)}, {city}", "city": city, "state": state, "country": country,
            "postal_code": maybe(0.95, str(rng.randint(10000, 99999))),
            "geographic_zone": rng.choice(["Urban", "Urban", "Suburban", "Rural"]),
            "phone": f"{COUNTRIES[country]['phone']} {rng.randint(100000000, 999999999)}",
            "email": f"sucursal{bid[-3:]}@latambank.com", "opening_time": "09:00:00", "closing_time": rng.choice(["16:00:00", "18:00:00"]),
            "has_atms": has_atms, "atm_count": rng.randint(1, 6) if has_atms else 0,
            "has_teller_windows": True, "teller_window_count": rng.randint(2, 10),
            "latitude": round(lat + rng.uniform(-0.05, 0.05), 7), "longitude": round(lon + rng.uniform(-0.05, 0.05), 7),
            "branch_opening_date": date(rng.randint(1995, 2022), rng.randint(1, 12), rng.randint(1, 28)),
            "branch_status": rng.choices(["Active", "Temporarily Closed", "Closed"], [0.92, 0.05, 0.03])[0],
        }
        data["branches"].append(row)
        branches_by_country[country].append(row)
    for country in COUNTRIES:  # every country needs at least one branch
        if not branches_by_country[country]:
            branches_by_country[country] = data["branches"][:1]

    # --- service agents -----------------------------------------------------
    agent_id = Ids("AG", 6)
    for _ in range(n(60)):
        country = rng.choice(list(COUNTRIES))
        cfg = COUNTRIES[country]
        aid = agent_id()
        first, last = rng.choice(cfg["first"]), rng.choice(cfg["last"])
        data["service_agents"].append({
            "agent_id": aid, "employee_code": f"EMP{aid[2:]}", "first_name": first, "last_name": last,
            "email": f"{aid.lower()}@latambank.com", "phone": maybe(0.9, f"{cfg['phone']} {rng.randint(100000000, 999999999)}"),
            "native_accent": cfg["accent"], "country_of_origin": country,
            "assigned_branch_id": rng.choice(branches_by_country[country])["branch_id"],
            "agent_type": rng.choice(["Phone", "In-Person", "Digital", "Hybrid"]),
            "experience_level": rng.choice(["Junior", "Mid-Senior", "Senior", "Specialist"]),
            "languages": rng.choice(["Spanish", "Spanish, English", "Spanish, Portuguese"]),
            "specialty": rng.choice(["Tarjetas", "Préstamos", "Cuentas", "Fraude", "Inversiones"]),
            "hire_date": date(rng.randint(2012, 2025), rng.randint(1, 12), rng.randint(1, 28)),
            "avg_csat": round(rng.uniform(3.0, 5.0), 2), "total_monthly_interactions": rng.randint(150, 900),
            "agent_status": rng.choices(["Active", "Vacation", "Leave", "Inactive"], [0.85, 0.07, 0.04, 0.04])[0],
            "work_shift": rng.choice(["Morning", "Afternoon", "Night", "Rotating"]),
        })
    agents = data["service_agents"]

    # --- marketing campaigns ------------------------------------------------
    campaign_id = Ids("CMP", 5)
    for _ in range(n(20)):
        start = rand_dt(START, END - timedelta(days=60)).date()
        product = rng.choice(PRODUCT_TYPES)
        data["marketing_campaigns"].append({
            "campaign_id": campaign_id(), "campaign_name": f"Campaña {product} {start:%b %Y}",
            "description": f"Promoción de {product} para clientes seleccionados.",
            "campaign_type": rng.choice(["Email", "SMS", "Push", "WhatsApp", "Voice", "Mix"]),
            "campaign_objective": rng.choice(["Acquisition", "Retention", "Cross-sell", "Up-sell", "Reactivation"]),
            "promoted_product": product, "target_segment": rng.choice(SEGMENTS), "target_country": rng.choice(list(COUNTRIES)),
            "start_date": start, "end_date": start + timedelta(days=rng.randint(14, 60)),
            "budget": money(5000, 200000), "campaign_status": rng.choice(["Planned", "Active", "Paused", "Completed"]),
            "expected_conversion_rate": round(rng.uniform(0.5, 8.0), 2),
        })

    # --- customers + products -----------------------------------------------
    customer_id, product_id = Ids("CUS", 8), Ids("PRD", 8)
    customer_products: dict[str, list[dict]] = {}
    for _ in range(n(500)):
        country = rng.choice(list(COUNTRIES))
        cfg = COUNTRIES[country]
        city, state, _, _ = rng.choice(cfg["places"])
        cid = customer_id()
        first, last = rng.choice(cfg["first"]), f"{rng.choice(cfg['last'])} {rng.choice(cfg['last'])}"
        segment = rng.choices(SEGMENTS, [0.1, 0.25, 0.5, 0.15])[0]
        reg = rand_dt(START - timedelta(days=3650), END - timedelta(days=30))
        income_usd = {"Premium": 6000, "Plus": 2500, "Basic": 900, "Student": 300}[segment] * rng.uniform(0.6, 1.6)
        local_income = income_usd / rates[(END.date(), cfg["currency"])]
        data["customers"].append({
            "customer_id": cid, "document_number": str(rng.randint(10**9, 10**10 - 1)), "document_type": rng.choice(cfg["doc_types"]),
            "first_name": first, "last_name": last,
            "date_of_birth": date(rng.randint(1950, 2006), rng.randint(1, 12), rng.randint(1, 28)),
            "gender": rng.choice(["M", "F", "O"]),
            "email": f"{first.split()[0].lower()}.{cid[-5:]}@correo.com",
            "mobile_phone": f"{cfg['phone']} {rng.randint(100000000, 999999999)}",
            "landline_phone": maybe(0.4, f"{cfg['phone']} {rng.randint(10000000, 99999999)}"),
            "address": f"Calle {rng.randint(1, 200)} # {rng.randint(1, 99)}-{rng.randint(1, 99)}, {city}",
            "city": city, "state": state, "country": country, "postal_code": str(rng.randint(10000, 99999)),
            "detected_accent": rng.choices([cfg["accent"], "neutral"], [0.85, 0.15])[0], "segment": segment,
            "credit_score": rng.randint(300, 850), "estimated_monthly_income": round(Decimal(str(local_income)), 2),
            "occupation": rng.choice(["Ingeniero", "Docente", "Comerciante", "Estudiante", "Médico", "Contador", "Independiente"]),
            "marital_status": rng.choice(["Soltero", "Casado", "Unión libre", "Divorciado", "Viudo"]),
            "education_level": rng.choice(["Secundaria", "Técnico", "Universitario", "Posgrado"]),
            "registration_date": reg, "registration_branch_id": rng.choice(branches_by_country[country])["branch_id"],
            "customer_status": rng.choices(["Active", "Inactive", "Suspended", "Closed"], [0.85, 0.08, 0.04, 0.03])[0],
            "last_updated": rand_dt(max(reg, END - timedelta(days=180)), END), "accepts_marketing": rng.random() < 0.6,
        })
        customer_products[cid] = []
        for ptype in rng.sample(PRODUCT_TYPES, rng.randint(1, 4)):
            currency = cfg["currency"] if rng.random() < 0.9 else "USD"
            is_credit = ptype in CREDIT_PRODUCTS
            opened = rand_dt(reg, END - timedelta(days=7))
            rate = 1.0 if currency == "USD" else rates[(END.date(), currency)]
            limit = Decimal(str(round(rng.choice([500, 1000, 3000, 8000, 20000]) / rate, 2))) if is_credit else None
            row = {
                "product_id": product_id(), "customer_id": cid, "product_type": ptype,
                "product_number": str(rng.randint(10**15, 10**16 - 1)), "currency": currency,
                "current_balance": Decimal(str(round(rng.uniform(0, 5000) / rate, 2))), "credit_limit": limit,
                "interest_rate": round(rng.uniform(20, 75), 2) if is_credit else round(rng.uniform(0, 12), 2),
                "opening_date": opened.date(),
                "expiration_date": (opened + timedelta(days=365 * rng.randint(2, 20))).date() if ptype != "Checking Account" else None,
                "opening_branch_id": rng.choice(branches_by_country[country])["branch_id"],
                "product_status": rng.choices(["Active", "Blocked", "Closed", "Suspended"], [0.85, 0.06, 0.06, 0.03])[0],
                "opening_channel": rng.choice(["Branch", "Web", "App", "Call Center"]), "has_linked_app": rng.random() < 0.7,
                "days_past_due": rng.choices([0, rng.randint(1, 120)], [0.85, 0.15])[0] if is_credit else None,
                "last_transaction_date": None, "last_updated": rand_dt(END - timedelta(days=90), END),
            }
            data["products"].append(row)
            customer_products[cid].append(row)
    customers = data["customers"]
    country_of = {c["customer_id"]: c["country"] for c in customers}

    # --- transactions -------------------------------------------------------
    tx_id = Ids("TXN", 10)
    for _ in range(n(20000)):
        c = rng.choice(customers)
        p = rng.choice(customer_products[c["customer_id"]])
        ts = rand_dt(max(datetime.combine(p["opening_date"], time()), START), END)
        ttype = rng.choices(["Deposit", "Withdrawal", "Transfer", "Payment", "Purchase", "Adjustment"], [15, 15, 20, 15, 33, 2])[0]
        category = rng.choice(list(MERCHANTS)) if ttype == "Purchase" else None
        city, _, lat, lon = rng.choice(COUNTRIES[c["country"]]["places"])
        is_fraud = rng.random() < 0.01
        amount = money(1, 800) / Decimal(str(1.0 if p["currency"] == "USD" else rates[(ts.date(), p["currency"])]))
        amount = round(amount, 2)
        channel = rng.choice(["POS", "App", "Web"]) if ttype == "Purchase" else rng.choice(["ATM", "Branch", "Web", "App", "Transfer"])
        status = "Declined" if is_fraud and rng.random() < 0.5 else rng.choices(["Approved", "Declined", "Pending", "Reversed"], [90, 5, 3, 2])[0]
        data["transactions"].append({
            "transaction_id": tx_id(), "transaction_date": ts, "process_date": ts.date() + timedelta(days=rng.choice([0, 0, 0, 1])),
            "product_id": p["product_id"], "customer_id": c["customer_id"], "transaction_type": ttype,
            "transaction_category": category, "amount": amount, "currency": p["currency"],
            "amount_usd": to_usd(amount, p["currency"], ts.date()), "channel": channel,
            "branch_id": rng.choice(branches_by_country[c["country"]])["branch_id"] if channel in ("Branch", "ATM") else None,
            "merchant_name": rng.choice(MERCHANTS[category]) if category else None,
            "merchant_category": str(rng.randint(5000, 5999)) if category else None,
            "transaction_country": c["country"] if rng.random() < 0.97 else rng.choice(list(COUNTRIES)),
            "transaction_city": city, "transaction_status": status,
            "response_code": "00" if status == "Approved" else rng.choice(["05", "51", "54", "91"]),
            "is_fraud": is_fraud, "fraud_score": round(rng.uniform(60, 99) if is_fraud else rng.uniform(0, 40), 2),
            "latitude": round(lat + rng.uniform(-0.1, 0.1), 7), "longitude": round(lon + rng.uniform(-0.1, 0.1), 7),
        })
        if p["last_transaction_date"] is None or ts > p["last_transaction_date"]:
            p["last_transaction_date"] = ts

    # --- call center interactions + transcripts + surveys --------------------
    int_id, tr_id, sv_id = Ids("INT", 10), Ids("TRS", 10), Ids("SRV", 10)
    for _ in range(n(3000)):
        c = rng.choice(customers)
        agent = rng.choice(agents)
        ts = rand_dt(max(c["registration_date"], START), END)
        category = rng.choice(list(CONTACT_REASONS))
        reason = rng.choice(CONTACT_REASONS[category])
        sentiment = rng.choices(["Positive", "Neutral", "Negative", "Very Negative"], [30, 40, 20, 10])[0]
        score = {"Positive": (0.3, 1), "Neutral": (-0.2, 0.3), "Negative": (-0.7, -0.2), "Very Negative": (-1, -0.7)}[sentiment]
        channel = rng.choice(["Phone", "Web Chat", "WhatsApp", "Email", "App"])
        has_transcript = channel in ("Phone", "Web Chat", "WhatsApp") and rng.random() < 0.3
        duration = rng.randint(60, 1800)
        resolved = rng.random() < 0.7
        interaction = {
            "interaction_id": int_id(), "interaction_date": ts, "process_date": ts.date(), "customer_id": c["customer_id"],
            "agent_id": agent["agent_id"],
            "interaction_type": "Chat" if channel in ("Web Chat", "WhatsApp", "App") else ("Email" if channel == "Email" else rng.choice(["Inbound Call", "Outbound Call"])),
            "channel": channel, "contact_reason": reason, "reason_category": category, "duration_seconds": duration,
            "wait_time_seconds": rng.randint(0, 900), "was_resolved": resolved, "requires_followup": not resolved,
            "detected_sentiment": sentiment, "sentiment_score": round(rng.uniform(*score), 2),
            "customer_detected_accent": c["detected_accent"], "agent_used_accent": rng.choice([agent["native_accent"], c["detected_accent"]]),
            "was_escalated": sentiment == "Very Negative" and rng.random() < 0.5,
            "mentioned_products": ",".join(p["product_id"] for p in rng.sample(customer_products[c["customer_id"]], 1)),
            "has_transcript": has_transcript, "has_recording": channel == "Phone",
        }
        data["call_center_interactions"].append(interaction)

        if has_transcript:
            accent = c["detected_accent"] if c["detected_accent"] != "neutral" else COUNTRIES[c["country"]]["accent"]
            hello, lead, bye = GREETING[accent]
            customer_text = f"{lead} tengo un problema: {reason.lower()}. ¿Me pueden ayudar?"
            agent_text = f"Con gusto reviso su caso de {reason.lower()}. Ya quedó registrado con el número {interaction['interaction_id']}."
            data["call_transcripts"].append({
                "transcript_id": tr_id(), "interaction_id": interaction["interaction_id"], "process_date": ts.date(),
                "customer_id": c["customer_id"], "agent_id": agent["agent_id"],
                "full_text": f"Agente: {hello}\nCliente: {customer_text}\nAgente: {agent_text}\nCliente: {bye}",
                "customer_text": f"{customer_text} {bye}", "agent_text": f"{hello} {agent_text}",
                "detected_language": "es", "detected_accent": accent, "accent_confidence": round(rng.uniform(0.6, 0.99), 2),
                "detected_keywords": ", ".join(reason.lower().split()[:3]),
                "mentioned_entities": json.dumps({"customer_id": c["customer_id"], "product_ids": interaction["mentioned_products"].split(",")}),
                "detected_intents": reason, "main_topics": category,
                "transcription_model": rng.choice(["Whisper", "Google STT"]), "audio_quality": rng.choice(["High", "Medium", "Low"]),
                "duration_seconds": duration,
            })

        if rng.random() < 0.33:
            stype = rng.choice(["CSAT", "NPS", "CES"])
            main = rng.randint(0, 10) if stype == "NPS" else rng.randint(1, 5)
            sts = ts + timedelta(hours=rng.uniform(0.5, 72))
            data["satisfaction_surveys"].append({
                "survey_id": sv_id(), "survey_date": sts, "process_date": sts.date(), "interaction_id": interaction["interaction_id"],
                "customer_id": c["customer_id"], "agent_id": agent["agent_id"], "survey_type": stype,
                "send_channel": rng.choice(["Email", "SMS", "IVR", "App", "Web"]), "main_score": main,
                "nps_category": ("Promoter" if main >= 9 else "Passive" if main >= 7 else "Detractor") if stype == "NPS" else None,
                "question_1_text": "¿El asesor resolvió su consulta?", "question_1_response": rng.randint(1, 5),
                "question_2_text": "¿Qué tan rápido fue atendido?", "question_2_response": rng.randint(1, 5),
                "question_3_text": "¿Recomendaría nuestro servicio?", "question_3_response": rng.randint(1, 5),
                "open_comments": rng.choice(["Muy buena atención.", "Tardaron mucho en contestar.", "No resolvieron mi problema.", "Todo excelente, gracias."]),
                "comment_sentiment": sentiment, "response_time_hours": round(Decimal(str((sts - ts).total_seconds() / 3600)), 2),
                "campaign_response_rate": round(rng.uniform(5, 40), 2),
            })

    # --- complaints ---------------------------------------------------------
    cmp_id = Ids("PQR", 9)
    complaint_customers: dict[str, list[datetime]] = {}
    interactions = data["call_center_interactions"]
    for _ in range(n(300)):
        origin = rng.choice(interactions) if rng.random() < 0.6 else None
        c = next(x for x in customers if x["customer_id"] == origin["customer_id"]) if origin else rng.choice(customers)
        ts = origin["interaction_date"] + timedelta(minutes=rng.randint(1, 120)) if origin else rand_dt(START, END)
        product = rng.choice(customer_products[c["customer_id"]])
        category = rng.choice(["Cargos no reconocidos", "Comisiones", "Atención al cliente", "Canales digitales", "Créditos"])
        status = rng.choices(["Open", "In Process", "Escalated", "Resolved", "Closed", "Rejected"], [15, 15, 5, 25, 35, 5])[0]
        assigned = ts + timedelta(hours=rng.uniform(1, 48))
        resolved = assigned + timedelta(days=rng.uniform(1, 30)) if status in ("Resolved", "Closed", "Rejected") else None
        claimed = money(10, 2000) if category in ("Cargos no reconocidos", "Comisiones") else None
        prior = complaint_customers.setdefault(c["customer_id"], [])
        data["complaints"].append({
            "complaint_id": cmp_id(), "creation_date": ts, "process_date": ts.date(), "customer_id": c["customer_id"],
            "case_type": rng.choice(["Complaint", "Claim", "Request", "Suggestion"]), "category": category,
            "subcategory": rng.choice(["Tarjeta de crédito", "Cuenta de ahorro", "App móvil", "Sucursal"]),
            "reception_channel": rng.choice(["Call Center", "Email", "Web", "App", "Branch", "Regulator"]),
            "affected_product_id": product["product_id"],
            "related_branch_id": rng.choice(branches_by_country[c["country"]])["branch_id"] if rng.random() < 0.3 else None,
            "origin_interaction_id": origin["interaction_id"] if origin else None,
            "description": f"El cliente reporta un problema de {category.lower()} relacionado con su {product['product_type']}.",
            "claimed_amount": claimed, "currency": product["currency"] if claimed else None,
            "priority": rng.choice(["Low", "Medium", "High", "Critical"]), "status": status,
            "assigned_agent_id": rng.choice(agents)["agent_id"], "assignment_date": assigned,
            "first_response_date": assigned + timedelta(hours=rng.uniform(1, 72)),
            "resolution_date": resolved, "closing_date": resolved + timedelta(days=1) if resolved and status == "Closed" else None,
            "sla_breached": bool(resolved and (resolved - ts).days > 15),
            "resolution_days": (resolved - ts).days if resolved else None,
            "resolution": "Se aplicó el ajuste correspondiente al cliente." if resolved else None,
            "compensation_granted": round(claimed * Decimal("0.5"), 2) if claimed and status == "Resolved" else None,
            "resolution_satisfaction": rng.randint(1, 5) if resolved else None,
            "is_repeat_complainer": any(timedelta(0) < ts - p <= timedelta(days=90) for p in prior),
        })
        prior.append(ts)

    # --- campaign sends -----------------------------------------------------
    send_id = Ids("SND", 10)
    campaigns = data["marketing_campaigns"]
    marketable = [c for c in customers if c["accepts_marketing"]] or customers
    for _ in range(n(5000)):
        camp = rng.choice(campaigns)
        c = rng.choice(marketable)
        ts = datetime.combine(camp["start_date"], time()) + timedelta(seconds=rng.randint(0, 86400 * 10))
        channel = camp["campaign_type"] if camp["campaign_type"] != "Mix" else rng.choice(["Email", "SMS", "Push", "WhatsApp", "Voice"])
        status = rng.choices(["Sent", "Failed", "Bounced", "Blocked"], [92, 3, 3, 2])[0]
        delivered = status == "Sent"
        opened = delivered and rng.random() < 0.35
        clicked = opened and rng.random() < 0.3
        converted = clicked and rng.random() < 0.2
        data["campaign_sends"].append({
            "send_id": send_id(), "send_date": ts, "process_date": ts.date(), "campaign_id": camp["campaign_id"],
            "customer_id": c["customer_id"], "send_channel": channel, "template_used": f"tpl_{channel.lower()}_v{rng.randint(1, 3)}",
            "subject": camp["campaign_name"], "send_status": status, "was_delivered": delivered,
            "was_opened": opened, "open_date": ts + timedelta(hours=rng.uniform(0.1, 48)) if opened else None,
            "was_clicked": clicked, "click_date": ts + timedelta(hours=rng.uniform(48, 72)) if clicked else None,
            "click_count": rng.randint(1, 4) if clicked else 0, "had_conversion": converted,
            "conversion_date": ts + timedelta(days=rng.uniform(3, 10)) if converted else None,
            "conversion_value": money(50, 5000) if converted else None,
            "open_device": rng.choice(["Mobile", "Desktop", "Tablet"]) if opened else None,
            "open_country": country_of[c["customer_id"]] if opened else None,
            "failure_reason": None if delivered else rng.choice(["Número inválido", "Buzón lleno", "Usuario bloqueó mensajes"]),
            "send_cost": Decimal(str(round(rng.uniform(0.001, 0.05), 4))),
        })

    # --- digital events -----------------------------------------------------
    ev_id = Ids("EVT", 11)
    pages = [("/login", "Iniciar sesión", "Authentication"), ("/inicio", "Inicio", "Navigation"),
             ("/cuentas", "Mis cuentas", "Product"), ("/transferir", "Transferencias", "Transaction"),
             ("/tarjetas/limite", "Límite de tarjeta", "Product"), ("/pagos", "Pagar servicios", "Transaction")]
    for _ in range(n(20000) // 5):
        c = rng.choice(customers) if rng.random() < 0.95 else None
        channel = rng.choice(["Android App", "iOS App", "Desktop Web", "Mobile Web"])
        is_mobile = channel != "Desktop Web"
        platform = {"Android App": "Android", "iOS App": "iOS"}.get(channel, rng.choice(["Windows", "MacOS", "Linux", "Android", "iOS"]))
        session = f"SES-{rng.getrandbits(48):012x}"
        ts = rand_dt()
        country = c["country"] if c else rng.choice(list(COUNTRIES))
        city = rng.choice(COUNTRIES[country]["places"])[0]
        for step in range(5):
            url, title, category = pages[0] if step == 0 else rng.choice(pages[1:])
            etype = "Login" if step == 0 else rng.choices(["PageView", "Click", "FormSubmit", "Error", "Purchase", "Logout"], [40, 30, 12, 6, 7, 5])[0]
            product = rng.choice(customer_products[c["customer_id"]]) if c and category in ("Product", "Transaction") else None
            ts_step = ts + timedelta(seconds=30 * step + rng.randint(0, 29))
            data["digital_events"].append({
                "event_id": ev_id(), "event_date": ts_step, "process_date": ts_step.date(),
                "customer_id": c["customer_id"] if c else None, "session_id": session, "event_type": etype,
                "event_category": category, "channel": channel, "platform": platform,
                "browser": None if "App" in channel else rng.choice(["Chrome", "Safari", "Firefox", "Edge"]),
                "app_version": f"5.{rng.randint(0, 9)}.{rng.randint(0, 20)}" if "App" in channel else None,
                "page_url": f"https://latambank.com{url}", "page_title": title, "action": etype.lower(),
                "element_id": f"btn_{title.split()[0].lower()}", "product_id": product["product_id"] if product else None,
                "event_value": money(10, 1000) if etype == "Purchase" else None, "duration_seconds": rng.randint(1, 120),
                "ip_address": f"{rng.randint(1, 223)}.{rng.randint(0, 255)}.{rng.randint(0, 255)}.{rng.randint(1, 254)}",
                "ip_country": country, "ip_city": city, "is_mobile": is_mobile,
                "referrer": rng.choice(["https://google.com", "https://facebook.com", "direct"]),
                "utm_source": rng.choice(["google", "facebook", "email", "sms"]), "utm_medium": rng.choice(["cpc", "organic", "campaign"]),
                "utm_campaign": rng.choice(campaigns)["campaign_id"],
            })
    return data


def add_quality_issues(data: dict[str, list[dict]], dup_rate: float, null_rate: float) -> None:
    """Inject nulls in nullable columns and duplicate rows, like the real dataset."""
    for name, rows in data.items():
        nullable = [c.name for c in TABLES[name].columns if not c.not_null]
        for row in rows:
            for col in nullable:
                if rng.random() < null_rate:
                    row[col] = None
        rows.extend(dict(r) for r in rng.sample(rows, int(len(rows) * dup_rate)))
        rng.shuffle(rows)


def fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    return str(v)


def write_csvs(data: dict[str, list[dict]], out: Path) -> None:
    for name, rows in data.items():
        cols = TABLES[name].column_names
        path = out / name / f"{name}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for row in rows:
                w.writerow(fmt(row.get(c)) for c in cols)
        print(f"{name:28s} {len(rows):>8,d} rows -> {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "dummy_output")
    parser.add_argument("--scale", type=float, default=1.0, help="Multiplier on row counts (1.0 = ~60k rows total)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dup-rate", type=float, default=0.02)
    parser.add_argument("--null-rate", type=float, default=0.05)
    args = parser.parse_args()

    rng.seed(args.seed)
    data = generate(args.scale)
    add_quality_issues(data, args.dup_rate, args.null_rate)
    write_csvs(data, args.out)


if __name__ == "__main__":
    main()
