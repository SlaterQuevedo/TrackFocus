// Transcripción de audio usando Web Audio API + Gemini API.
const AudioTranscriber = (() => {

  let mediaRecorder = null;
  let audioStream = null;
  let chunks = [];
  let isRecording = false;

  // Solicitar micrófono y comenzar grabación
  async function startRecording(onStateChange) {
    try {
      if (isRecording) return;

      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      chunks = [];
      isRecording = true;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstart = () => {
        onStateChange?.('recording');
      };

      mediaRecorder.onstop = () => {
        isRecording = false;
        onStateChange?.('stopped');
      };

      mediaRecorder.start();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Se denegó acceso al micrófono. Verifica los permisos del navegador.');
      }
      throw new Error(`Micrófono no disponible: ${err.message}`);
    }
  }

  // Detener grabación y devolver blob de audio
  async function stopRecording() {
    return new Promise((resolve, reject) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        reject(new Error('No hay grabación activa'));
        return;
      }

      mediaRecorder.onstop = async () => {
        try {
          // Crear blob de audio
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          chunks = [];

          // Detener todos los tracks
          audioStream?.getTracks().forEach(track => track.stop());
          mediaRecorder = null;
          audioStream = null;

          resolve(audioBlob);
        } catch (err) {
          reject(err);
        }
      };

      mediaRecorder.onerror = (err) => {
        reject(new Error(`Error en grabación: ${err.error}`));
      };

      mediaRecorder.stop();
    });
  }

  // Transcribir audio blob a texto (usa Gemini si hay clave disponible)
  async function transcribe(audioBlob, language = 'es-ES') {
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Archivo de audio vacío');
    }

    const key = window.GEMINI_API_KEY || '';
    if (key) {
      return _transcribeWithGemini(audioBlob);
    }

    // Fallback al endpoint backend (retorna mock sin Gemini)
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('language', language);

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Transcripción fallida' }));
      throw new Error(err.error || 'Transcripción fallida');
    }

    return await response.json();
  }

  // Transcripción directa con Gemini API (sin servidor)
  async function _transcribeWithGemini(audioBlob) {
    const key = window.GEMINI_API_KEY;

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Error al leer audio'));
      reader.readAsDataURL(audioBlob);
    });

    const mimeType = audioBlob.type || 'audio/webm';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: 'Transcribe exactamente lo que se dice en este audio. Devuelve únicamente la transcripción del texto hablado, sin explicaciones, sin comillas, sin formato adicional.' },
              { inlineData: { mimeType, data: base64 } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        })
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error transcribiendo: ${res.status}`);
    }

    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return { text, confidence: 0.95, language: 'es-ES', duration_ms: 0 };
  }

  function isRecordingNow() {
    return isRecording;
  }

  function getMicrophonePermissionStatus() {
    // Nota: navigator.permissions es limitado en algunos navegadores
    if (!navigator.permissions || !navigator.permissions.query) {
      return null;
    }
    return navigator.permissions.query({ name: 'microphone' });
  }

  return {
    startRecording,
    stopRecording,
    transcribe,
    isRecordingNow,
    getMicrophonePermissionStatus
  };
})();
