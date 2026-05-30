// Gestión de archivos multimedia para estudio con IA.
// Almacena archivos en memoria del browser como base64 (sin Supabase Storage).
const Files = (() => {

  const ALLOWED_TYPES = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    pdf:   ['application/pdf'],
    pptx:  ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'],
    video: ['video/mp4', 'video/webm', 'video/ogg'],
    docx:  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    txt:   ['text/plain']
  };

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB (límite razonable para Gemini inline)

  // Cache en memoria: fileId → { base64, mimeType }
  const _cache = {};

  function getFileTypeCategory(mimeType) {
    for (const [cat, mimes] of Object.entries(ALLOWED_TYPES)) {
      if (mimes.includes(mimeType)) return cat;
    }
    // Intentar por prefijo para cubrir variantes
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return null;
  }

  function validateFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Archivo demasiado grande. Máximo ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
    }
    const category = getFileTypeCategory(file.type);
    if (!category) {
      throw new Error(`Tipo de archivo no permitido: ${file.type || 'desconocido'}`);
    }
    return true;
  }

  // Leer archivo como base64 y guardarlo en memoria (sin Supabase)
  async function upload(file, sessionId = null) {
    const s = Storage.get();
    const userId = s.currentUserId;
    if (!userId) throw new Error('No autenticado');

    validateFile(file);

    const fileId   = Storage.uuid();
    const fileType = getFileTypeCategory(file.type);

    // Leer como base64 en el browser
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsDataURL(file);
    });

    _cache[fileId] = { base64, mimeType: file.type };

    const record = {
      id:          fileId,
      userId,
      fileName:    file.name,
      fileType,
      mimeType:    file.type,
      fileSize:    file.size,
      storagePath: null,
      uploadedAt:  new Date().toISOString(),
      sessionId:   sessionId || null,
      classroomId: s.users[userId]?.classroomId || null,
      metadata:    {},
      createdAt:   new Date().toISOString()
    };

    Storage.set(st => {
      if (!st.uploadedFiles) st.uploadedFiles = {};
      st.uploadedFiles[fileId] = record;
    });

    return record;
  }

  // Devuelve { base64, mimeType } o null si no está en cache
  function getBase64(fileId) {
    return _cache[fileId] || null;
  }

  function listFor(userId) {
    const s = Storage.get();
    if (!s.uploadedFiles) return [];
    return Object.values(s.uploadedFiles)
      .filter(f => f.userId === userId)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  function get(fileId) {
    const s = Storage.get();
    return s.uploadedFiles?.[fileId] || null;
  }

  async function delete_(fileId) {
    delete _cache[fileId];
    Storage.set(st => {
      if (st.uploadedFiles && st.uploadedFiles[fileId]) {
        delete st.uploadedFiles[fileId];
      }
    });
  }

  // Compatibilidad: getDownloadUrl ya no aplica (sin Supabase Storage)
  async function getDownloadUrl(fileId) {
    return null;
  }

  return {
    ALLOWED_TYPES,
    MAX_FILE_SIZE,
    getFileTypeCategory,
    validateFile,
    upload,
    getBase64,
    listFor,
    get,
    delete:         delete_,
    getDownloadUrl
  };
})();
