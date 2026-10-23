/**
 * Modular LLM Enrichment Service
 * Produces clinical summary, sentiment, body area, and severity from transcript turns.
 * Provider is isolated in `callLLMProvider` so it can be swapped effortlessly.
 */

export interface TranscriptTurnInput {
  role: string;
  text: string;
}

export interface EnrichmentResult {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  bodyArea: "lower back" | "neck" | "shoulder" | "knee" | "hip" | "other";
  severity: number;
  extractedName?: { firstName: string; lastName: string };
}

/**
 * Single swappable LLM execution point.
 * Checks for OPENAI_API_KEY or GROQ_API_KEY, and falls back to deterministic clinical heuristics.
 */
async function callLLMProvider(formattedTranscript: string): Promise<EnrichmentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
  const baseUrl = process.env.GROQ_API_KEY
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = process.env.GROQ_API_KEY ? "llama-3.1-8b-instant" : "gpt-4o-mini";

  if (!apiKey) {
    return null; // Fallback to heuristic parser
  }

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a clinical AI scribe for Happy Harmony Physiotherapy Clinic. Analyze this call transcript between receptionist Hannah and a caller. Output strictly valid JSON with:
- "summary": string (2-3 sentences summarizing caller's purpose, condition, and resolution)
- "sentiment": "positive" | "neutral" | "negative"
- "bodyArea": "lower back" | "neck" | "shoulder" | "knee" | "hip" | "other"
- "severity": integer from 1 to 5
- "extractedName": optional object with "firstName" and "lastName"`,
          },
          {
            role: "user",
            content: formattedTranscript,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || "Call processed by clinical receptionist.",
      sentiment: ["positive", "neutral", "negative"].includes(parsed.sentiment)
        ? parsed.sentiment
        : "neutral",
      bodyArea: ["lower back", "neck", "shoulder", "knee", "hip", "other"].includes(
        parsed.bodyArea?.toLowerCase()
      )
        ? parsed.bodyArea.toLowerCase()
        : "other",
      severity: Math.min(Math.max(Number(parsed.severity) || 3, 1), 5),
      extractedName: parsed.extractedName,
    };
  } catch (err) {
    console.error("LLM enrichment failed, falling back to heuristic parser:", err);
    return null;
  }
}

/**
 * Deterministic clinical heuristic fallback when LLM API keys are not configured or offline.
 */
function heuristicEnrichment(turns: TranscriptTurnInput[]): EnrichmentResult {
  const fullText = turns.map((t) => `${t.role}: ${t.text}`).join("\n").toLowerCase();

  // 1. Detect body area
  let bodyArea: EnrichmentResult["bodyArea"] = "other";
  if (fullText.includes("lower back") || fullText.includes("lumbar") || fullText.includes("spine")) {
    bodyArea = "lower back";
  } else if (fullText.includes("neck") || fullText.includes("cervical") || fullText.includes("whiplash")) {
    bodyArea = "neck";
  } else if (fullText.includes("shoulder") || fullText.includes("rotator cuff") || fullText.includes("frozen shoulder")) {
    bodyArea = "shoulder";
  } else if (fullText.includes("knee") || fullText.includes("acl") || fullText.includes("meniscus") || fullText.includes("patella")) {
    bodyArea = "knee";
  } else if (fullText.includes("hip") || fullText.includes("groin") || fullText.includes("pelvic")) {
    bodyArea = "hip";
  }

  // 2. Detect severity
  let severity = 3;
  if (fullText.includes("severe") || fullText.includes("unbearable") || fullText.includes("excruciating") || fullText.includes("can't walk") || fullText.includes("emergency") || fullText.includes("10/10") || fullText.includes("8/10") || fullText.includes("9/10")) {
    severity = 5;
  } else if (fullText.includes("hurts a lot") || fullText.includes("throbbing") || fullText.includes("7/10") || fullText.includes("intense")) {
    severity = 4;
  } else if (fullText.includes("mild") || fullText.includes("stiff") || fullText.includes("tight") || fullText.includes("sore")) {
    severity = 2;
  }

  // 3. Detect sentiment
  let sentiment: EnrichmentResult["sentiment"] = "neutral";
  if (fullText.includes("thank you so much") || fullText.includes("perfect") || fullText.includes("great") || fullText.includes("wonderful") || fullText.includes("appreciate")) {
    sentiment = "positive";
  } else if (fullText.includes("frustrated") || fullText.includes("terrible") || fullText.includes("horrible") || fullText.includes("upset") || fullText.includes("annoyed")) {
    sentiment = "negative";
  }

  // 4. Generate summary
  const booked = fullText.includes("booked") || fullText.includes("appointment confirmed") || fullText.includes("see you");
  const callerTurns = turns.filter((t) => t.role === "caller");
  const firstCallerUtterance = callerTurns[0]?.text || "inquired about services";

  // 5. Extract caller name if spoken
  let extractedName: { firstName: string; lastName: string } | undefined = undefined;
  for (let i = 0; i < turns.length - 1; i++) {
    const t = turns[i];
    const next = turns[i + 1];
    if (t.role === "agent") {
      const lower = t.text.toLowerCase();
      if (lower.includes("first name") && next.role === "caller") {
        const words = next.text.trim().split(/[,.\s]+/);
        const rawFirst = words[0]?.replace(/[^a-zA-Z]/g, "");
        if (rawFirst && rawFirst.length > 1) {
          extractedName = extractedName || { firstName: rawFirst, lastName: "" };
          extractedName.firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
        }
      } else if (lower.includes("last name") && next.role === "caller") {
        const words = next.text.trim().split(/[,.\s]+/);
        const rawLast = words[0]?.replace(/[^a-zA-Z]/g, "");
        if (rawLast && rawLast.length > 1) {
          extractedName = extractedName || { firstName: "Patient", lastName: rawLast };
          extractedName.lastName = rawLast.charAt(0).toUpperCase() + rawLast.slice(1).toLowerCase();
        }
      }
    }
  }

  // Also check if agent confirmed: "Thank you, Sofia Farik" or "Thank you Sofia Farik"
  for (const t of turns) {
    if (t.role === "agent") {
      const m = t.text.match(/thank you,?\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/i);
      if (m && m[1] && m[2]) {
        extractedName = {
          firstName: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(),
          lastName: m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase(),
        };
        break;
      }
    }
  }

  const summary = `Caller (${extractedName ? `${extractedName.firstName} ${extractedName.lastName}` : "Patient"}) contacted the clinic regarding ${bodyArea} symptoms (${firstCallerUtterance.slice(0, 80)}). Receptionist Hannah triaged the inquiry. ${
    booked ? "An assessment appointment was successfully booked." : "No appointment was finalized on this call."
  }`;

  return {
    summary,
    sentiment,
    bodyArea,
    severity,
    extractedName,
  };
}

/**
 * Main enrichment pipeline function
 */
export async function enrichTranscript(turns: TranscriptTurnInput[]): Promise<EnrichmentResult> {
  if (turns.length === 0) {
    return {
      summary: "Incomplete or empty call with no transcript recorded.",
      sentiment: "neutral",
      bodyArea: "other",
      severity: 1,
    };
  }

  const formatted = turns.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join("\n");
  const llmResult = await callLLMProvider(formatted);

  if (llmResult) {
    return llmResult;
  }

  return heuristicEnrichment(turns);
}
