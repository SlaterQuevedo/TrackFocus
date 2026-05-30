// Vercel Edge Function: Chat educativo con Gemini 3.1 Flash Lite
// action "message"  → streaming SSE del tutor
// action "finalize" → calcula métricas de concentración y aprendizaje

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body;

  if (action === 'message')  return handleMessage(req, res);
  if (action === 'finalize') return handleFinalize(req, res);

  return res.status(400).json({ error: 'action debe ser "message" o "finalize"' });
};

function buildSystemPrompt(metadata) {
  const { subject, grade, durationMin, previousActivity } = metadata;
  return `Eres TrackTutor, el tutor de IA de TrackFocus para estudiantes de secundaria.

CONTEXTO DE LA SESIÓN:
- Grado: ${grade}
- Materia: ${subject}
- Duración planificada: ${durationMin} minutos
- Actividad previa del alumno: ${previousActivity}

REGLAS OBLIGATORIAS:
1. Adapta el lenguaje y la complejidad exactamente al nivel de ${grade} de secundaria.
2. Explica con claridad cualquier tema que el alumno pregunte.
3. Al final de CADA respuesta tuya (sin excepción), plantea entre 1 y 3 preguntas cortas o ejercicios para que el alumno resuelva en el chat. Etiquétalos claramente como "📝 Pregunta:" o "📝 Ejercicio:".
4. Cuando el alumno responda una pregunta, evalúa sin decirlo explícitamente si fue correcta. Si falló, guíalo con una pista sin dar la respuesta directa.
5. Mantén un tono motivador y cercano.
6. Responde siempre en español.`.trim();
}

function buildEvaluationPrompt(history, metadata) {
  const transcript = history
    .map(m => `[${m.role === 'user' ? 'ALUMNO' : 'TUTOR'}]: ${m.content}`)
    .join('\n');

  return `Analiza la siguiente sesión de estudio y devuelve SOLO un JSON válido (sin markdown, sin texto extra).

SESIÓN:
Materia: ${metadata.subject}
Grado: ${metadata.grade}
Duración: ${metadata.durationMin} minutos

TRANSCRIPCIÓN:
${transcript}

Devuelve exactamente este JSON:
{
  "questions_attempted": <número de preguntas/ejercicios que planteó el tutor>,
  "questions_correct": <número que el alumno respondió correctamente>,
  "coherence": <decimal 0-1 que refleja la coherencia y relevancia de las respuestas del alumno>,
  "engagement_notes": "<frase breve sobre el nivel de participación>"
}`;
}

async function handleMessage(req, res) {
  const { metadata, history = [], userMessage } = req.body;

  if (!metadata || !userMessage) {
    return res.status(400).json({ error: 'metadata y userMessage son requeridos' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });

  const systemTurn = {
    role: 'user',
    parts: [{ text: buildSystemPrompt(metadata) }]
  };
  const systemAck = {
    role: 'model',
    parts: [{ text: 'Entendido. Estoy listo para ser el tutor de esta sesión.' }]
  };

  const priorTurns = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  const contents = [systemTurn, systemAck, ...priorTurns, {
    role: 'user',
    parts: [{ text: userMessage }]
  }];

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });
  } catch (err) {
    return res.status(502).json({ error: 'Error conectando con Gemini: ' + err.message });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return res.status(geminiRes.status).json({ error: 'Gemini error: ' + errText });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = geminiRes.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        } catch {
          // línea SSE incompleta — ignorar
        }
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

async function handleFinalize(req, res) {
  const { metadata, history = [] } = req.body;

  if (!metadata || !history.length) {
    return res.status(400).json({ error: 'metadata e history son requeridos' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });

  const userTurns = history.filter(m => m.role === 'user' && m.timestamp);
  const modelTurns = history.filter(m => m.role === 'model' && m.timestamp);

  const responseDelays = [];
  for (let i = 0; i < userTurns.length; i++) {
    const prevModel = modelTurns.filter(m => m.timestamp < userTurns[i].timestamp).pop();
    if (prevModel) {
      responseDelays.push((userTurns[i].timestamp - prevModel.timestamp) / 1000);
    }
  }

  let avgResponseSec = 60;
  if (responseDelays.length) {
    const sorted = [...responseDelays].sort((a, b) => a - b);
    avgResponseSec = Math.round(sorted[Math.floor(sorted.length / 2)]);
  }

  function responseTimeScore(sec) {
    if (sec < 30)  return 1.0;
    if (sec < 60)  return 0.8;
    if (sec < 120) return 0.6;
    if (sec < 300) return 0.3;
    return 0.1;
  }
  const scoreA = responseTimeScore(avgResponseSec);

  let scoreB = 0.5;
  let questionsAttempted = 0;
  let questionsCorrect = 0;
  let coherence = 0.5;

  try {
    const evalUrl = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const evalRes = await fetch(evalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildEvaluationPrompt(history, metadata) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
      })
    });

    if (evalRes.ok) {
      const evalJson = await evalRes.json();
      const raw = evalJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        questionsAttempted = parsed.questions_attempted || 0;
        questionsCorrect   = parsed.questions_correct   || 0;
        coherence          = Math.min(1, Math.max(0, parsed.coherence || 0.5));
        const accuracy = questionsAttempted > 0
          ? questionsCorrect / questionsAttempted
          : 0.5;
        scoreB = (accuracy * 0.7) + (coherence * 0.3);
      }
    }
  } catch {
    // Mantener scoreB = 0.5 si falla la evaluación
  }

  const wordCounts = userTurns.map(m => m.content.trim().split(/\s+/).length);
  const avgWords = wordCounts.length
    ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length
    : 0;

  function engagementScore(words) {
    if (words < 5)  return 0.2;
    if (words < 15) return 0.5;
    if (words < 30) return 0.8;
    return 1.0;
  }
  const scoreC = engagementScore(avgWords);

  const concentrationRaw = (scoreA * 0.35) + (scoreB * 0.45) + (scoreC * 0.20);
  const concentration = Math.min(5, Math.max(1, Math.round(concentrationRaw * 4) + 1));

  return res.status(200).json({
    concentration,
    metrics: {
      learning_score:        Math.round(scoreB * 100) / 100,
      avg_response_time_sec: avgResponseSec,
      response_time_score:   Math.round(scoreA * 100) / 100,
      response_quality:      Math.round(scoreB * 100) / 100,
      engagement:            Math.round(scoreC * 100) / 100,
      avg_words_per_message: Math.round(avgWords),
      questions_attempted:   questionsAttempted,
      questions_correct:     questionsCorrect,
      coherence:             Math.round(coherence * 100) / 100
    }
  });
}
