// Proxy para Gemini API — análisis de archivos educativos
// Llama directamente a la API REST de Gemini con contenido base64
const GeminiProxy = (() => {

  const MODEL = 'gemini-3.1-flash-lite';
  const BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';

  function getKey() {
    return window.GEMINI_API_KEY || '';
  }

  // Analiza un archivo y devuelve resumen, conceptos, preguntas, ejercicios y retroalimentación
  async function analyzeFile(fileRecord, context = {}) {
    const key    = getKey();
    const cached = Files.getBase64(fileRecord.id);

    if (!key || !cached) {
      return _mockAnalysis(fileRecord.fileName);
    }

    const prompt = `Eres un tutor educativo para estudiantes de secundaria. Analiza el siguiente material de estudio y proporciona un análisis completo en español con este formato exacto:

## 📋 RESUMEN
Escribe un resumen completo y detallado del contenido del material.

## 💡 CONCEPTOS CLAVE
Lista los 5-7 conceptos más importantes con una explicación breve de cada uno.

## ❓ PREGUNTAS DE PRÁCTICA
Genera 5 preguntas numeradas. Después de cada pregunta agrega la respuesta en una nueva línea que empiece con "R:".

## ✏️ EJERCICIOS
Proporciona 3 ejercicios prácticos numerados con instrucciones claras y el objetivo de aprendizaje.

## 🔄 RETROALIMENTACIÓN
Sugiere estrategias de estudio específicas para este material y menciona las áreas que requieren más atención.`;

    try {
      const res = await fetch(`${BASE}/${MODEL}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: cached.mimeType, data: cached.base64 } }
            ]
          }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('[GeminiProxy] analyzeFile error:', res.status, err.error?.message);
        return _mockAnalysis(fileRecord.fileName);
      }

      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return _parseAnalysis(text, fileRecord.fileName);

    } catch (e) {
      console.warn('[GeminiProxy] analyzeFile exception:', e);
      return _mockAnalysis(fileRecord.fileName);
    }
  }

  // Responde una pregunta del estudiante sobre un archivo (modo socrático)
  async function answerQuestion(fileId, question, existingAnalysis) {
    const key    = getKey();
    const cached = Files.getBase64(fileId);

    if (!key || !cached) {
      return 'Configura tu GEMINI_API_KEY para que la IA pueda responder sobre el archivo.';
    }

    const instructionText = `Actúa como tutor educativo socrático para estudiantes de secundaria.
El estudiante pregunta: "${question}"

REGLAS:
- NUNCA des la respuesta completa directamente.
- Guía con preguntas y pistas progresivas.
- Si el estudiante pide la respuesta directa, responde con una pista clave.
- Verifica comprensión con preguntas de seguimiento.
- Adapta el lenguaje al nivel de secundaria.
- Responde siempre en español.
- Al final plantea al menos una pregunta de seguimiento.`;

    try {
      const res = await fetch(`${BASE}/${MODEL}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: instructionText },
              { inlineData: { mimeType: cached.mimeType, data: cached.base64 } }
            ]
          }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 1024 }
        })
      });

      if (!res.ok) return 'Error al contactar la IA. Intenta de nuevo.';
      const json = await res.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de la IA.';

    } catch (e) {
      return 'Error al contactar la IA. Verifica tu conexión.';
    }
  }

  // ── Helpers privados ────────────────────────────────────────────

  function _parseAnalysis(text, fileName) {
    const sections = {
      summary:     _extractSection(text, 'RESUMEN'),
      keyConcepts: _extractSection(text, 'CONCEPTOS CLAVE'),
      questions:   _parseQuestions(_extractSection(text, 'PREGUNTAS DE PRÁCTICA')),
      exercises:   _parseExercises(_extractSection(text, 'EJERCICIOS')),
      feedback:    _extractSection(text, 'RETROALIMENTACIÓN')
    };

    if (!sections.summary && text) {
      sections.summary = text.slice(0, 500) + (text.length > 500 ? '...' : '');
    }

    return sections;
  }

  function _extractSection(text, sectionName) {
    const regex = new RegExp(`##[^#]*${sectionName}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  function _parseQuestions(text) {
    if (!text) return [];
    const lines  = text.split('\n').filter(l => l.trim());
    const result = [];
    let current  = null;
    for (const line of lines) {
      if (/^\d+[\.\)]\s/.test(line)) {
        if (current) result.push(current);
        current = { text: line.replace(/^\d+[\.\)]\s/, '').trim(), answer: '' };
      } else if (line.startsWith('R:') && current) {
        current.answer = line.slice(2).trim();
      } else if (current && !current.answer) {
        current.text += ' ' + line.trim();
      }
    }
    if (current) result.push(current);
    return result;
  }

  function _parseExercises(text) {
    if (!text) return [];
    const lines  = text.split('\n').filter(l => l.trim());
    const result = [];
    let current  = null;
    for (const line of lines) {
      if (/^\d+[\.\)]\s/.test(line)) {
        if (current) result.push(current);
        current = { title: `Ejercicio ${result.length + 1}`, prompt: line.replace(/^\d+[\.\)]\s/, '').trim() };
      } else if (current) {
        current.prompt += ' ' + line.trim();
      }
    }
    if (current) result.push(current);
    return result;
  }

  function _mockAnalysis(fileName) {
    return {
      summary:     `Vista previa de "${fileName}". Configura GEMINI_API_KEY para análisis real.`,
      keyConcepts: 'Configura tu clave de Gemini para obtener los conceptos clave.',
      questions:   [{ text: '¿Cuál es el tema principal del material?', answer: 'Analiza el material con tu tutor IA.' }],
      exercises:   [{ title: 'Ejercicio 1', prompt: 'Lee el material y resume los puntos principales.' }],
      feedback:    'Agrega tu GEMINI_API_KEY en js/supabase-config.js para obtener análisis real.'
    };
  }

  return { analyzeFile, answerQuestion };
})();
