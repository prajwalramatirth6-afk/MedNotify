import os
import random
from typing import Optional, List
from google import genai
from google.genai import types

from schemas import ChatRequest, MedicationItem, UserProfile

FALLBACK_TIPS = [
    "Drink a full glass of water with your medication for better absorption.",
    "Try to take your medicine at the same time every day to build a habit.",
    "Keep a list of all your medications in your wallet for emergencies.",
    "Store your medications in a cool, dry place away from direct sunlight.",
    "Don't hesitate to ask your pharmacist if you have questions about side effects."
]


def get_api_key() -> str:
    return os.getenv("GEMINI_API_KEY") or os.getenv("VITE_API_KEY") or os.getenv("API_KEY") or ""


def get_gemini_client() -> Optional[genai.Client]:
    key = get_api_key()
    if not key:
        return None
    return genai.Client(api_key=key)


def get_daily_health_tip() -> str:
    client = get_gemini_client()
    if not client:
        return random.choice(FALLBACK_TIPS)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="Provide a unique, one-sentence health tip for someone taking daily medications. Focus on hydration, consistency, safety, or wellness. Keep it short and encouraging.",
        )
        return response.text.strip() if response.text else random.choice(FALLBACK_TIPS)
    except Exception as exc:
        print(f"[Gemini Service] Daily tip error: {exc}")
        return random.choice(FALLBACK_TIPS)


def get_medication_guidance(name: str, dose: str = "") -> str:
    client = get_gemini_client()
    if not client:
        return "Remember to take as prescribed by your doctor."

    try:
        dose_info = f" ({dose})" if dose else ""
        prompt = (
            f"Provide a brief (max 2 sentences) tip for taking {name}{dose_info}. "
            "Focus on common advice like 'take with food' or 'avoid alcohol'. Professional and helpful."
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text.strip() if response.text else "Remember to take as prescribed by your doctor."
    except Exception as exc:
        print(f"[Gemini Service] Medication insight error: {exc}")
        return "Remember to take as prescribed by your doctor."


def analyze_patient_safety(req: ChatRequest) -> str:
    client = get_gemini_client()
    if not client:
        return (
            "🔑 Google Gemini API Key Required on Server\n\n"
            "Please configure GEMINI_API_KEY in backend/.env to enable live clinical AI safety checks.\n"
            "Get a free API key at: https://aistudio.google.com/app/apikey"
        )

    # Build active medications summary
    if req.medications:
        meds_summary = ", ".join(f"{m.name} ({m.dose or 'dose unspecified'}, {m.frequency or 'Daily'})" for m in req.medications)
    else:
        meds_summary = "None currently registered"

    # Build patient vitals / profile summary
    prof = req.profile or UserProfile()
    system_instruction = f"""You are the MedNotify Health Assistant, a safety-focused medication advisor.

PATIENT PROFILE:
- Age / Gender: {prof.age or 'Unspecified'} / {prof.gender or 'Unspecified'}
- Vitals: Blood Pressure: {prof.bloodPressure or 'N/A'}, Blood Sugar: {prof.sugarLevel or 'N/A'}
- Documented Allergies: {prof.allergies or 'NONE LISTED - proceed with standard caution'}
- Medical History Notes: {prof.doctorNotes or 'None'}

ACTIVE MEDICATIONS (Patient currently takes these):
{meds_summary}

STRICT SAFETY PROTOCOLS:
1. DRUG-DRUG INTERACTIONS: If the user asks about taking a new drug, supplement, or herb, immediately check for interactions against active medications.
2. ALLERGY RISKS: Warn immediately if a requested medication belongs to a drug family the patient is allergic to.
3. CONTRAINDICATIONS: Flag if any medication conflicts with the patient's vitals (e.g. high BP or diabetes).
4. TONE & FORMAT: Use bullet points, clear warning tags like '⚠️ INTERACTION ALERT' when a risk exists, and empathetic, professional guidance.
5. DISCLAIMER: Always conclude with: '⚠️ DISCLAIMER: This is AI-generated informational guidance. Always consult your primary doctor or pharmacist before changing your medication regimen.'
"""

    contents = []
    for msg in req.history:
        role = "user" if msg.role == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.text)]))

    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=req.message)]))

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.3,
            )
        )
        return response.text.strip() if response.text else "Unable to generate safety analysis. Please rephrase your question."
    except Exception as exc:
        print(f"[Gemini Service] Safety analysis error: {exc}")
        return f"Unable to reach the safety analysis database right now. Details: {exc}"

