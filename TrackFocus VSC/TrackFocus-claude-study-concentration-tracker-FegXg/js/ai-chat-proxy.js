// Cliente para /api/ai-chat — chat educativo con Gemini 2.5 Flash Preview
const AiChatProxy = (() => {

  const ENDPOINT = '/api/ai-chat';

  // Envía un mensaje y llama onChunk(text) por cada fragmento recibido.
  // Devuelve Promise<string> con el texto completo al terminar.
  async function sendMessage(metadata, history, userMessage, onChunk) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'message', metadata, history, userMessage })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Error ${res.status}`);
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
      buffer = lines.pop(); // última línea puede estar incompleta

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(parsed.text);
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
      }
    }

    return fullText;
  }

  // Finaliza la sesión y devuelve { concentration, metrics }
  async function finalizeSession(metadata, history) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize', metadata, history })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Error ${res.status}`);
    }

    return res.json();
  }

  return { sendMessage, finalizeSession };
})();
