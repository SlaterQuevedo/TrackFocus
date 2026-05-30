// Componentes UI reutilizables para módulo multimedia de estudio.
const UIComponentsMultimedia = (() => {

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // ---- FileUploader ----
  // Componente para cargar archivos con drag-drop y click
  function FileUploader(id = 'fileUpload', onFileSelected) {
    return `
      <div class="file-uploader" id="${esc(id)}">
        <div class="upload-zone" id="${esc(id)}-zone">
          <div style="font-size:36px;margin-bottom:8px;">📤</div>
          <h3>Arrastra archivos aquí</h3>
          <p class="muted">o haz clic para seleccionar</p>
          <input type="file" id="${esc(id)}-input" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.pptx,.mp3,.wav,.m4a,.mp4,.webm,.docx,.txt" style="display:none;" />
        </div>
        <div class="upload-progress hidden" id="${esc(id)}-progress">
          <p class="muted" id="${esc(id)}-status">Cargando...</p>
        </div>
      </div>`;
  }

  function wireFileUploader(id, onFileSelected) {
    const zone = document.getElementById(`${id}-zone`);
    const input = document.getElementById(`${id}-input`);
    const progress = document.getElementById(`${id}-progress`);
    const status = document.getElementById(`${id}-status`);

    if (!zone || !input) return;

    const handleFiles = async (files) => {
      for (const file of files) {
        try {
          progress.classList.remove('hidden');
          status.textContent = `Cargando ${esc(file.name)}...`;

          const fileRecord = await Files.upload(file);
          progress.classList.add('hidden');
          onFileSelected?.(fileRecord);
        } catch (err) {
          UI.flash?.(err.message, 'error');
          progress.classList.add('hidden');
        }
      }
    };

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      input.value = '';  // Reset para permitir re-seleccionar mismo archivo
    });

    // Drag & drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
  }

  // ---- FilePreviewCard ----
  // Tarjeta compacta para mostrar archivo cargado
  function FilePreviewCard(file, onDelete) {
    const icons = {
      image: '🖼️', pdf: '📄', pptx: '📊',
      audio: '🎵', video: '🎬', docx: '📝', txt: '📋'
    };
    const icon = icons[file.fileType] || '📎';
    const sizeKb = Math.round(file.fileSize / 1024);
    const uploadDate = new Date(file.uploadedAt).toLocaleDateString('es-PE');

    return `
      <div class="file-preview-card" data-file-id="${esc(file.id)}">
        <div class="card-icon">${icon}</div>
        <div class="card-info">
          <h4 title="${esc(file.fileName)}">${esc(file.fileName.substring(0, 30))}</h4>
          <p class="muted">${sizeKb}KB · ${uploadDate}</p>
        </div>
        <div class="card-actions">
          <button class="ghost delete" data-delete="${esc(file.id)}" title="Eliminar">✕</button>
        </div>
      </div>`;
  }

  // ---- AIStudyChat ----
  // Interfaz de chat para interacción con análisis de IA
  function AIStudyChat(id = 'aiChat') {
    return `
      <div class="ai-study-chat" id="${esc(id)}">
        <div class="chat-messages" id="${esc(id)}-messages"></div>
        <div class="chat-input-wrap">
          <textarea id="${esc(id)}-textarea" placeholder="Pregunta sobre tu documento..." rows="3"></textarea>
          <div style="display:flex;gap:8px;">
            <button class="primary" id="${esc(id)}-send" style="flex:1;">Enviar</button>
            <button class="ghost" id="${esc(id)}-mic" title="Grabar pregunta">🎤</button>
          </div>
        </div>
      </div>`;
  }

  // Agregar mensaje al chat
  function wireChatMessage(chatId, message, isUser = false) {
    const messagesDiv = document.getElementById(`${chatId}-messages`);
    if (!messagesDiv) return;

    const msgEl = document.createElement('div');
    msgEl.className = `chat-message ${isUser ? 'user' : 'assistant'}`;
    msgEl.innerHTML = `<div class="message-content">${esc(message)}</div>`;
    messagesDiv.appendChild(msgEl);

    // Auto-scroll al final
    setTimeout(() => {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, 0);
  }

  // Limpiar mensajes del chat
  function clearChatMessages(chatId) {
    const messagesDiv = document.getElementById(`${chatId}-messages`);
    if (messagesDiv) messagesDiv.innerHTML = '';
  }

  // Mostrar spinner de carga
  function showChatLoading(chatId) {
    const messagesDiv = document.getElementById(`${chatId}-messages`);
    if (!messagesDiv) return;

    const loadingEl = document.createElement('div');
    loadingEl.className = 'chat-message assistant loading';
    loadingEl.id = `${chatId}-loading`;
    loadingEl.innerHTML = '<div class="spinner"></div>';
    messagesDiv.appendChild(loadingEl);

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // Remover spinner de carga
  function removeChatLoading(chatId) {
    const loadingEl = document.getElementById(`${chatId}-loading`);
    if (loadingEl) loadingEl.remove();
  }

  // Obtener contenido actual de textarea
  function getChatInput(chatId) {
    return document.getElementById(`${chatId}-textarea`)?.value || '';
  }

  // Limpiar textarea
  function clearChatInput(chatId) {
    const textarea = document.getElementById(`${chatId}-textarea`);
    if (textarea) textarea.value = '';
  }

  return {
    FileUploader,
    wireFileUploader,
    FilePreviewCard,
    AIStudyChat,
    wireChatMessage,
    clearChatMessages,
    showChatLoading,
    removeChatLoading,
    getChatInput,
    clearChatInput
  };
})();
