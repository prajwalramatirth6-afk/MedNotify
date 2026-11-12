import { GoogleGenAI } from "@google/genai";
import { UserProfile, Medication, ChatMessage } from "../types";

const BACKEND_URL = (import.meta as any)?.env?.VITE_BACKEND_URL || 'http://localhost:8000';

export const getGeminiApiKey = (): string => {
  if (typeof process !== 'undefined' && process.env?.API_KEY) {
    return process.env.API_KEY;
  }
  const metaEnv = (import.meta as any)?.env;
  if (metaEnv?.VITE_API_KEY) return metaEnv.VITE_API_KEY;
  if (metaEnv?.GEMINI_API_KEY) return metaEnv.GEMINI_API_KEY;
  if (typeof window !== 'undefined' && window.localStorage) {
    const local = localStorage.getItem('mednotify_gemini_api_key');
    if (local) return local.trim();
  }
  return '';
};

const getAI = () => {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error("API key is not configured.");
  }
  return new GoogleGenAI({ apiKey: key });
};

/**
 * Fetch medication tip from Python FastAPI backend with client fallback.
 */
export const getMedicationInsight = async (name: string, dose: string): Promise<string> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/medications/insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dose })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.insight) return data.insight;
    }
  } catch {
    // Backend offline, fallback to client-side
  }

  if (!getGeminiApiKey()) {
    return "Remember to take as prescribed by your doctor.";
  }

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Provide a very brief (max 2 sentences) tip for taking ${name} (${dose}). Focus on common advice like "take with food" or "avoid alcohol". Keep it professional and helpful.`,
    });
    return response.text || "Remember to take as prescribed by your doctor.";
  } catch {
    return "Remember to take as prescribed by your doctor.";
  }
};

/**
 * Fetch daily health tip from Python FastAPI backend with client fallback.
 */
export const getDailyHealthTip = async (): Promise<string> => {
  const fallbacks = [
    "Drink a full glass of water with your medication for better absorption.",
    "Try to take your medicine at the same time every day to build a habit.",
    "Keep a list of all your medications in your wallet for emergencies.",
    "Store your medications in a cool, dry place away from direct sunlight.",
    "Don't hesitate to ask your pharmacist if you have questions about side effects."
  ];

  try {
    const res = await fetch(`${BACKEND_URL}/api/tips/daily`);
    if (res.ok) {
      const data = await res.json();
      if (data.tip) return data.tip;
    }
  } catch {
    // Backend offline, continue to fallback
  }

  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
};

/**
 * Find nearby pharmacies using Maps grounding tool.
 */
export const findNearbyPharmacies = async (lat: number, lng: number) => {
  if (!getGeminiApiKey()) {
    return null;
  }
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-09-2025",
      contents: "List the top 5 pharmacies closest to my current location. Provide their names and website or map links if possible.",
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: lat,
              longitude: lng
            }
          }
        }
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const results = chunks
      .filter((chunk: any) => chunk.maps)
      .map((chunk: any) => ({
        name: chunk.maps.title || "Nearby Pharmacy",
        uri: chunk.maps.uri,
      }));

    return results.length > 0 ? results : null;
  } catch (error) {
    console.error("Maps Grounding Error:", error);
    return null;
  }
};

/**
 * AI Health Assistant: Queries Python FastAPI backend with client fallback.
 */
export const chatWithAIDoctor = async (
  message: string,
  history: ChatMessage[],
  profile: UserProfile,
  meds: Medication[]
): Promise<string> => {
  // 1. Try Python FastAPI backend first
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        profile,
        medications: meds.map(m => ({
          name: m.name,
          dose: m.dose,
          frequency: m.frequency,
          expiryDate: m.expiryDate
        }))
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.reply) return data.reply;
    }
  } catch {
    // Server offline, proceed to client fallback
  }

  // 2. Client-side fallback if backend is unreachable
  if (!getGeminiApiKey()) {
    return "🔑 Google Gemini API Key Required\n\nTo enable AI drug-drug interaction and allergy checks:\n1. Configure GEMINI_API_KEY in backend/.env for the Python server.\n2. Or tap the Settings icon (⚙️) in the top header and enter your key.\n\nGet a free key in seconds at: https://aistudio.google.com/app/apikey";
  }

  try {
    const ai = getAI();
    const medsSummary = meds.map(m => `${m.name} (${m.dose}, ${m.frequency})`).join(', ');
    const systemInstruction = `You are "MedNotify AI Health Assistant", a safety-focused medical advisor.
Cross-reference user questions against their profile (Age: ${profile.age}, BP: ${profile.bloodPressure}, Allergies: ${profile.allergies}) and current medications (${medsSummary}). Always include a standard medical disclaimer.`;

    const apiHistory = history.filter((msg, index) => index !== 0 || msg.role !== 'model');
    const contents = [
      ...apiHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.3
      }
    });

    return response.text || "Unable to analyze safety profile.";
  } catch (err: any) {
    return "Unable to reach safety service. Details: " + (err?.message || "Unknown error");
  }
};
