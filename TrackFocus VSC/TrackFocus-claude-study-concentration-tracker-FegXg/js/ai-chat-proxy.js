// Cliente directo para Gemini API (sin servidor Vercel)
// Llama la API REST de Gemini directamente desde el browser
const AiChatProxy = (() => {

  const MODEL = 'gemini-3.1-flash-lite';
  const BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';

  function getKey() {
    return window.GEMINI_API_KEY || '';
  }

  async function sendMessage(metadata, history, userMessage, onChunk, files = []) {
    const key = getKey();
    if (!key) {
      const fallback = _buildFallback(userMessage, metadata);
      for (const char of fallback) {
        onChunk(char);
        await _sleep(2);
      }
      return fallback;
    }

    const systemText = _buildSystemPrompt(metadata);

    // Construir partes del mensaje del usuario (texto + archivos adjuntos)
    const userParts = [{ text: userMessage || 'Analiza este material y ayúdame a entenderlo.' }];
    for (const f of files) {
      if (f.base64 && f.mimeType) {
        userParts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
      }
    }

    const contents = [
      { role: 'user',  parts: [{ text: systemText }] },
      { role: 'model', parts: [{ text: 'Entendido. Estoy listo para ser el tutor de esta sesión.' }] },
      ...history.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      { role: 'user', parts: userParts }
    ];

    const url = `${BASE}/${MODEL}:streamGenerateContent?key=${key}&alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error ${res.status}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText  = '';
    let buffer    = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            fullText += text;
            onChunk(text);
          }
        } catch (_) {}
      }
    }

    return fullText;
  }

  async function finalizeSession(metadata, history) {
    const key = getKey();
    if (!key) {
      return {
        concentration: 3,
        metrics: {
          learning_score: 0.6,
          avg_response_time_sec: 10,
          response_time_score: 0.6,
          response_quality: 0.6,
          engagement: 0.5,
          avg_words_per_message: 15,
          questions_attempted: 2,
          questions_correct: 1,
          coherence: 0.6
        }
      };
    }

    const transcript = history
      .map(m => `[${m.role === 'user' ? 'ALUMNO' : 'TUTOR'}]: ${m.content}`)
      .join('\n');

    const evalPrompt = `Analiza esta sesión de ${metadata.subject} (${metadata.grade}) y devuelve SOLO JSON válido:
{"questions_attempted":N,"questions_correct":N,"coherence":0.0-1.0,"engagement_notes":"..."}

TRANSCRIPCIÓN:
${transcript}`;

    const url = `${BASE}/${MODEL}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: evalPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
      })
    });

    if (!res.ok) {
      return {
        concentration: 3,
        metrics: {
          questions_attempted: 2,
          questions_correct: 1,
          coherence: 0.6,
          engagement_notes: 'Sesión completada'
        }
      };
    }

    const json = await res.json();
    const raw  = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let eval_ = {};
    try {
      eval_ = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch(_) {}

    const { questions_attempted = 2, questions_correct = 1, coherence = 0.6 } = eval_;
    const score = (questions_correct / Math.max(questions_attempted, 1)) * 0.45 + coherence * 0.35 + 0.2;
    const concentration = Math.max(1, Math.min(5, Math.round(score * 4) + 1));

    return {
      concentration,
      metrics: {
        learning_score: score,
        avg_response_time_sec: 8,
        response_time_score: 0.7,
        response_quality: coherence,
        engagement: 0.6,
        avg_words_per_message: 15,
        questions_attempted,
        questions_correct,
        coherence,
        engagement_notes: eval_.engagement_notes || ''
      }
    };
  }

  // ── Helpers privados ──────────────────────────────────────────────

  function _buildSystemPrompt(metadata) {
    const { subject, grade, durationMin, previousActivity } = metadata;
    return `Eres TrackTutor, tutor de IA para estudiantes de secundaria de TrackFocus.
CONTEXTO: Grado ${grade}, Materia ${subject}, Duración ${durationMin} min, Actividad previa: ${previousActivity}.
REGLAS: 1) Adapta al nivel ${grade}. 2) Al final de CADA respuesta plantea 1-3 preguntas ("📝 Pregunta:"). 3) Si el alumno falla, da pistas sin dar la respuesta. 4) Tono motivador. 5) Responde siempre en español. 6) NUNCA resuelvas ejercicios completos. 7) Método socrático. 8) Si piden la respuesta directa, da una pista clave. 9) Detecta respuestas sin razonar y pide explicación.`;
  }

  function _buildFallback(userMessage, metadata) {
    const msg = (userMessage || '').toLowerCase();
    let r = '';
    if (msg.includes('hola') || msg.includes('hi'))
      r = `¡Hola! Soy tu tutor de ${metadata.subject}. ¿Qué tema quieres explorar hoy?`;
    else if (msg.includes('?'))
      r = `Buena pregunta. Antes de responder: ¿qué crees tú que podría ser la respuesta basándote en lo que ya sabes?`;
    else if (msg.includes('no entiendo') || msg.includes('difícil'))
      r = `Entiendo tu duda. Desglosemos el tema. ¿Cuál es específicamente la parte que te confunde?`;
    else
      r = `Para ayudarte mejor con ${metadata.subject}: ¿qué parte específica te cuesta más entender?`;
    return r + '\n\n📝 Pregunta: ¿Cuál sería tu primer paso para resolver esto?';
  }

  function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  return { sendMessage, finalizeSession };
})();
