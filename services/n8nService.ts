import { UserProfile, Medication, ChatMessage } from '../types';

// Default webhook endpoints for n8n
// Note: webhook-test is only active when "Execute workflow" or "Listen for test event" is clicked in n8n.
// Production webhook is active 24/7 when the n8n workflow is toggled Active.
export const N8N_TEST_WEBHOOK_URL = 'https://mednotify.app.n8n.cloud/webhook-test/mednotify-ai-doctor-manual';
export const N8N_PROD_WEBHOOK_URL = 'https://mednotify.app.n8n.cloud/webhook/mednotify-ai-doctor-manual';

export interface N8nPayload {
  message: string;
  history: ChatMessage[];
  profile: {
    age: string;
    gender: string;
    bloodPressure: string;
    sugarLevel: string;
    allergies: string;
    doctorNotes: string;
  };
  medications: Array<{
    name: string;
    dose: string;
    frequency: string;
    expiryDate?: string;
  }>;
  timestamp: string;
}

/**
 * Sends a consultation message to the n8n automation webhook.
 * Supports both test and production webhook URLs with automatic fallback.
 */
export const queryN8nHealthAssistant = async (
  message: string,
  history: ChatMessage[],
  profile: UserProfile,
  meds: Medication[]
): Promise<string | null> => {
  const payload: N8nPayload = {
    message,
    history,
    profile: {
      age: profile.age,
      gender: profile.gender,
      bloodPressure: profile.bloodPressure,
      sugarLevel: profile.sugarLevel,
      allergies: profile.allergies,
      doctorNotes: profile.doctorNotes
    },
    medications: meds.map(m => ({
      name: m.name,
      dose: m.dose,
      frequency: m.frequency,
      expiryDate: m.expiryDate
    })),
    timestamp: new Date().toISOString()
  };

  // Try the provided test webhook first; if not registered (404), try production endpoint
  const urlsToTry = [N8N_TEST_WEBHOOK_URL, N8N_PROD_WEBHOOK_URL];

  for (const url of urlsToTry) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 404) {
        // Test webhook not actively listening in n8n editor, try next URL
        console.warn(`n8n webhook returned 404 at ${url}. Trying next endpoint...`);
        continue;
      }

      if (!response.ok) {
        console.warn(`n8n webhook error at ${url}: status ${response.status}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        // Support standard n8n output formats
        if (typeof data === 'string' && data.trim()) return data;
        if (data?.output && typeof data.output === 'string') return data.output;
        if (data?.response && typeof data.response === 'string') return data.response;
        if (data?.text && typeof data.text === 'string') return data.text;
        if (data?.message && typeof data.message === 'string') return data.message;
        if (Array.isArray(data) && data[0]) {
          const first = data[0];
          const textCandidate = first.output || first.response || first.text || first.message;
          if (textCandidate && typeof textCandidate === 'string') return textCandidate;
        }
      } else {
        const text = await response.text();
        if (text && text.trim()) return text;
      }
    } catch (err) {
      console.warn(`n8n request failed for ${url}:`, err);
    }
  }

  return null;
};

