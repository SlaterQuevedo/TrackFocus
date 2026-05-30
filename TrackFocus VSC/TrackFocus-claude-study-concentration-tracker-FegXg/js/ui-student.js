// UI Estudiante — Dashboard, Sesiones, Estudio IA, Estadísticas, Ranking, Perfil
const UIStudent = (() => {

  // ---- Chat IA — estado en memoria (no persiste en Storage) ----
  let _chatState = null;

  function _readBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function _startAiChat(metadata) {
    _chatState = { metadata, history: [], startedAt: Date.now(), attachedFiles: [] };
    const tabTutor = document.getElementById('tabTutor');
    if (tabTutor) {
      tabTutor.innerHTML = _renderChatScreen(metadata);
      _wireChatScreen();
      _sendAiMessage('Hola, estoy listo para comenzar. ¿Qué tema de ' + metadata.subject + ' vas a estudiar hoy?');
    }
  }

  function _renderChatScreen(metadata) {
    const gradeLabel = {
      '1ro': '1ro Sec.', '2do': '2do Sec.', '3ro': '3ro Sec.',
      '4to': '4to Sec.', '5to': '5to Sec.'
    }[metadata.grade] || metadata.grade;

    return `
      <div class="chat-screen">
        <div class="chat-header">
          <div class="chat-header-info">
            <span class="chat-header-title">🤖 TrackTutor · ${esc(metadata.subject)}</span>
            <span class="chat-header-sub">${esc(gradeLabel)} · ${metadata.durationMin} min planificados</span>
          </div>
          <div class="chat-header-actions">
            <button class="ghost" id="chatCancelBtn" style="font-size:12px;padding:6px 12px;">Cancelar</button>
            <button class="primary" id="chatFinalizeBtn" style="font-size:12px;padding:6px 14px;">Finalizar sesión</button>
          </div>
        </div>

        <div class="chat-messages" id="chatMessages"></div>

        <div class="chat-input-area">
          <div class="chat-attachments" id="chatAttachments"></div>
          <div class="chat-input-row">
            <button class="ghost chat-attach-btn" id="chatAttachBtn" title="Adjuntar archivo" style="height:44px;padding:0 12px;flex-shrink:0;">📎</button>
            <input type="file" id="chatFileInput" multiple style="display:none"
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.pptx,.mp3,.wav,.m4a,.mp4,.webm,.docx,.txt" />
            <textarea
              id="chatInput"
              placeholder="Escribe, habla o adjunta archivos..."
              rows="1"
            ></textarea>
            <button class="ghost chat-mic-btn" id="chatMicBtn" title="Hablar" style="height:44px;padding:0 12px;flex-shrink:0;">🎤</button>
            <button class="primary" id="chatSendBtn" style="height:44px;padding:0 18px;flex-shrink:0;">Enviar</button>
          </div>
          <div class="chat-footer-actions">
            <span class="chat-hint">Enter para enviar · Shift+Enter nueva línea · 📎 adjuntar · 🎤 voz</span>
          </div>
        </div>
      </div>`;
  }

  function _wireChatScreen() {
    const input     = document.getElementById('chatInput');
    const sendBtn   = document.getElementById('chatSendBtn');
    const finalBtn  = document.getElementById('chatFinalizeBtn');
    const cancelBtn = document.getElementById('chatCancelBtn');

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Enter envía, Shift+Enter nueva línea
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    // Adjuntar archivos
    const attachBtn  = document.getElementById('chatAttachBtn');
    const fileInput  = document.getElementById('chatFileInput');
    const attachArea = document.getElementById('chatAttachments');

    attachBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async (e) => {
      for (const file of Array.from(e.target.files || [])) {
        try {
          const base64 = await _readBase64(file);
          const id     = Math.random().toString(36).slice(2);
          if (_chatState) {
            _chatState.attachedFiles.push({ id, fileName: file.name, mimeType: file.type, base64 });
          }
          const chip = document.createElement('div');
          chip.className = 'chat-attach-chip';
          chip.innerHTML = `<span>📄 ${esc(file.name)}</span><button data-fid="${id}">✕</button>`;
          chip.querySelector('button').addEventListener('click', () => {
            if (_chatState) _chatState.attachedFiles = _chatState.attachedFiles.filter(f => f.id !== id);
            chip.remove();
          });
          attachArea?.appendChild(chip);
        } catch(err) {
          UI.flash?.('Error al leer el archivo: ' + err.message, 'error');
        }
      }
      if (fileInput) fileInput.value = '';
    });

    // Micrófono
    const micBtn = document.getElementById('chatMicBtn');
    let _micRecording = false;
    micBtn?.addEventListener('click', async () => {
      if (!_micRecording) {
        _micRecording = true;
        micBtn.textContent = '⏹';
        micBtn.classList.add('recording');
        try {
          await AudioTranscriber.startRecording(() => {});
        } catch(err) {
          _micRecording = false;
          micBtn.textContent = '🎤';
          micBtn.classList.remove('recording');
          UI.flash?.(err.message, 'error');
        }
      } else {
        _micRecording = false;
        micBtn.textContent = '⌛';
        micBtn.classList.remove('recording');
        try {
          const audioBlob   = await AudioTranscriber.stopRecording();
          const { text }    = await AudioTranscriber.transcribe(audioBlob, 'es-ES');
          micBtn.textContent = '🎤';
          if (text && text.trim()) {
            input.value = text.trim();
            sendBtn.click();
          } else {
            UI.flash?.('No se detectó voz. Intenta de nuevo.', 'error');
          }
        } catch(err) {
          micBtn.textContent = '🎤';
          UI.flash?.(err.message, 'error');
        }
      }
    });

    // Enviar (texto + archivos adjuntos)
    sendBtn.addEventListener('click', () => {
      const text  = input.value.trim();
      const files = _chatState?.attachedFiles ? [..._chatState.attachedFiles] : [];
      if (!text && files.length === 0) return;
      if (!_chatState) return;
      input.value = '';
      input.style.height = 'auto';
      if (attachArea) attachArea.innerHTML = '';
      if (_chatState) _chatState.attachedFiles = [];
      _handleUserMessage(text, files);
    });

    cancelBtn.addEventListener('click', () => {
      if (!confirm('¿Salir de la sesión? No se guardará el progreso.')) return;
      _chatState = null;
      App.go('ai-study');
    });

    finalBtn.addEventListener('click', () => _finalizeChat());
  }

  function _appendBubble(role, text, streaming) {
    const messages = document.getElementById('chatMessages');
    if (!messages) return null;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${role}`;
    bubble.textContent = text || '';
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function _showTyping() {
    const messages = document.getElementById('chatMessages');
    if (!messages) return null;
    const typing = document.createElement('div');
    typing.className = 'chat-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
    return typing;
  }

  function _removeTyping() {
    document.querySelector('.chat-typing')?.remove();
  }

  function _sendAiMessage(userTriggerText) {
    const typingEl = _showTyping();
    const sendBtn = document.getElementById('chatSendBtn');
    const finalBtn = document.getElementById('chatFinalizeBtn');
    if (sendBtn) sendBtn.disabled = true;
    if (finalBtn) finalBtn.disabled = true;

    const ts = Date.now();
    _chatState.history.push({ role: 'user', content: userTriggerText, timestamp: ts });

    _removeTyping();
    const bubble = _appendBubble('ia', '', true);

    let fullText = '';
    AiChatProxy.sendMessage(
      _chatState.metadata,
      _chatState.history.slice(0, -1),
      userTriggerText,
      (chunk) => {
        if (bubble) {
          bubble.textContent += chunk;
          const msgs = document.getElementById('chatMessages');
          if (msgs) msgs.scrollTop = msgs.scrollHeight;
        }
      }
    ).then(text => {
      fullText = text;
      _chatState.history.push({ role: 'model', content: fullText, timestamp: Date.now() });
      if (sendBtn) sendBtn.disabled = false;
      if (finalBtn) finalBtn.disabled = false;
    }).catch(err => {
      if (bubble) bubble.textContent = '⚠️ Error al contactar al tutor. Intenta de nuevo.';
      UI.flash(err.message, 'error');
      if (sendBtn) sendBtn.disabled = false;
      if (finalBtn) finalBtn.disabled = false;
    });
  }

  async function _handleUserMessage(text, files = []) {
    if (!_chatState) return;
    const ts = Date.now();

    const displayText = text + (files.length > 0 ? '\n' + files.map(f => '📎 ' + f.fileName).join('\n') : '');
    _appendBubble('user', displayText);

    const typingEl = _showTyping();
    const sendBtn  = document.getElementById('chatSendBtn');
    const finalBtn = document.getElementById('chatFinalizeBtn');
    if (sendBtn)  sendBtn.disabled = true;
    if (finalBtn) finalBtn.disabled = true;

    const histContent = text || (files.length > 0 ? '(Archivos adjuntos: ' + files.map(f => f.fileName).join(', ') + ')' : '');
    _chatState.history.push({ role: 'user', content: histContent, timestamp: ts });

    _removeTyping();
    const bubble = _appendBubble('ia', '', true);

    let fullText = '';
    try {
      fullText = await AiChatProxy.sendMessage(
        _chatState.metadata,
        _chatState.history.slice(0, -1),
        text || 'Analiza este material y ayúdame a entenderlo.',
        (chunk) => {
          if (bubble) {
            bubble.textContent += chunk;
            const msgs = document.getElementById('chatMessages');
            if (msgs) msgs.scrollTop = msgs.scrollHeight;
          }
        },
        files
      );
      _chatState.history.push({ role: 'model', content: fullText, timestamp: Date.now() });
    } catch (err) {
      if (bubble) bubble.textContent = '⚠️ Error al contactar al tutor. Intenta de nuevo.';
      UI.flash(err.message, 'error');
      _chatState.history.pop();
    } finally {
      if (sendBtn)  sendBtn.disabled = false;
      if (finalBtn) finalBtn.disabled = false;
    }
  }

  async function _finalizeChat() {
    if (!_chatState) return;

    if (_chatState.history.length < 2) {
      UI.flash('Chatea un poco más antes de finalizar la sesión.', 'error');
      return;
    }

    const finalBtn  = document.getElementById('chatFinalizeBtn');
    const cancelBtn = document.getElementById('chatCancelBtn');
    if (finalBtn)  finalBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    const spinner = document.createElement('div');
    spinner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:48px;z-index:9999;';
    spinner.textContent = '⏳';
    document.body.appendChild(spinner);

    try {
      const { concentration, metrics } = await AiChatProxy.finalizeSession(
        _chatState.metadata,
        _chatState.history
      );

      const rec = Sessions.add(_chatState.metadata, concentration, metrics, _chatState.startedAt, Date.now());
      const { gamResult } = rec;

      const xpToast = document.createElement('div');
      xpToast.className = 'xp-toast';
      xpToast.innerHTML = `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:40px;margin-bottom:8px;">+${gamResult.xpEarned} XP</div>
          ${gamResult.newBadges.length > 0 ? `<div>🏆 ${gamResult.newBadges.map(b => b.emoji).join(' ')}</div>` : ''}
        </div>
      `;
      document.body.appendChild(xpToast);
      setTimeout(() => xpToast.remove(), 2000);

      UI.flash(`Sesión completada. Concentración: ${concentration}/5`, 'success');
      _chatState = null;
      setTimeout(() => App.go('ai-study'), 1500);
    } catch (err) {
      UI.flash(err.message, 'error');
      if (finalBtn)  finalBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
    } finally {
      spinner.remove();
    }
  }

  // ---- Dashboard ----
  function screenDashboard() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const sessions = Sessions.listFor(user.id);
    const now = new Date();

    const sessionCount = sessions.length;
    const hourCount = Math.round(sessions.reduce((sum, s) => sum + (s.durationMin || 0), 0) / 60 * 10) / 10;
    const recentSessions = sessions.slice(0, 5);

    return `
      <div class="card" style="margin-bottom:20px;">
        <h1>Hola, ${esc(user.name.split(' ')[0])}</h1>
        <p style="color:var(--muted);">¿Listo para estudiar?</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:24px;">
        <button class="card action-btn" data-action="new-session" style="cursor:pointer;">
          <div style="font-size:32px;margin-bottom:8px;">📝</div>
          <div style="font-weight:600;">Nueva Sesión</div>
          <div style="font-size:12px;color:var(--muted);">Con IA Tutor</div>
        </button>
        <button class="card action-btn" data-action="ai-study" style="cursor:pointer;">
          <div style="font-size:32px;margin-bottom:8px;">🧠</div>
          <div style="font-weight:600;">Estudio IA</div>
          <div style="font-size:12px;color:var(--muted);">Tutor + Material</div>
        </button>
        <button class="card action-btn" data-action="pomodoro" style="cursor:pointer;">
          <div style="font-size:32px;margin-bottom:8px;">🍅</div>
          <div style="font-weight:600;">Pomodoro</div>
          <div style="font-size:12px;color:var(--muted);">Técnica de enfoque</div>
        </button>
      </div>

      <div class="card">
        <h2 style="margin:0 0 12px;">Sesiones recientes</h2>
        ${recentSessions.length > 0 ? `
          <ul style="list-style:none;padding:0;margin:0;">
            ${recentSessions.map(s => `
              <li style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
                <strong>${esc(s.subject)}</strong> · ${s.concentration}/5 ⭐ · ${s.durationMin}min
              </li>
            `).join('')}
          </ul>
        ` : `<p style="color:var(--muted);">No hay sesiones aún.</p>`}
      </div>
    `;
  }

  function wireDashboard() {
    root().querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action) App.go(action);
      });
    });
  }

  // ---- Nueva Sesión (formulario) ----
  function screenNewSession() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const subjects = Subjects.listSubjects(user.institutionType || 'colegio', user.id);
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const grades = [
      { id: '1ro', label: '1ro de Secundaria' },
      { id: '2do', label: '2do de Secundaria' },
      { id: '3ro', label: '3ro de Secundaria' },
      { id: '4to', label: '4to de Secundaria' },
      { id: '5to', label: '5to de Secundaria' }
    ];

    return `
      <div class="card">
        <h1>Nueva Sesión con IA</h1>
        <form id="sessionForm">
          <div class="row">
            <div class="field">
              <label>Fecha y hora</label>
              <input type="datetime-local" name="datetime" value="${local}" required />
            </div>
            <div class="field">
              <label>Duración (minutos)</label>
              <input type="number" name="durationMin" min="5" max="240" value="30" required />
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label>Curso / materia</label>
              <select name="subject" required>
                ${subjects.map(x => `<option>${esc(x)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Grado escolar</label>
              <select name="grade" required>
                ${grades.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Actividad previa</label>
            <select name="previousActivity" required>
              ${Sessions.PREVIOUS_ACTIVITIES.map(a => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" class="ghost" id="cancelBtn">Cancelar</button>
            <button type="submit" class="primary">Comenzar sesión ✨</button>
          </div>
        </form>
      </div>
    `;
  }

  function wireNewSession() {
    const form = document.getElementById('sessionForm');
    const cancelBtn = document.getElementById('cancelBtn');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const metadata = {
        datetime: fd.get('datetime'),
        durationMin: Number(fd.get('durationMin')),
        subject: fd.get('subject'),
        grade: fd.get('grade'),
        previousActivity: fd.get('previousActivity')
      };
      _startAiChat(metadata);
      document.getElementById('tabTutor').scrollIntoView();
    });

    cancelBtn.addEventListener('click', () => App.go('dashboard'));
  }

  // ---- Pomodoro (página dedicada) ----
  function screenPomodoro() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const subjects = Subjects.listSubjects(user.institutionType || 'colegio', user.id);
    const pState = Pomodoro.getState();
    const remaining = pState.remaining || Pomodoro.DEFAULTS.focus * 60;

    return `
      <div class="card">
        <h1>🍅 Pomodoro</h1>
        <div style="text-align:center;padding:40px 0;">
          <div style="font-size:72px;font-weight:700;color:var(--primary);margin-bottom:12px;" id="pomDisplay">
            ${Pomodoro.formatTime(remaining)}
          </div>
          <div style="font-size:18px;color:var(--muted);margin-bottom:24px;" id="pomModeDisplay">
            ${pState.mode === 'focus' ? 'Enfoque 🧠' : pState.mode === 'break' ? 'Descanso ☕' : 'Listo'}
          </div>
          <div style="display:flex;gap:8px;justify-content:center;margin-bottom:24px;">
            <button class="primary" id="pomStart">▶ Iniciar</button>
            <button class="ghost" id="pomPause">⏸ Pausar</button>
            <button class="ghost" id="pomSkip">⏭ Saltar</button>
            <button class="ghost" id="pomReset">↺ Reiniciar</button>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Materia</label>
            <select id="pomSubject">
              ${subjects.map(x => `<option>${esc(x)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Enfoque (min)</label>
            <input type="number" id="pomFocus" min="1" max="120" value="${Pomodoro.DEFAULTS.focus}" />
          </div>
          <div class="field">
            <label>Descanso (min)</label>
            <input type="number" id="pomBreak" min="1" max="30" value="${Pomodoro.DEFAULTS.shortBreak}" />
          </div>
        </div>
      </div>
    `;
  }

  function wirePomodoro() {
    const display = document.getElementById('pomDisplay');
    const modeDisplay = document.getElementById('pomModeDisplay');

    const modeLabels = { focus: 'Enfoque 🧠', break: 'Descanso ☕', paused: 'Pausado ⏸', idle: 'Listo' };

    Pomodoro.setCallbacks(
      (remaining, mode) => {
        if (display) display.textContent = Pomodoro.formatTime(remaining);
        if (modeDisplay) modeDisplay.textContent = modeLabels[mode] || '';
      },
      (completedMode) => {
        if (display) display.textContent = Pomodoro.formatTime(Pomodoro.DEFAULTS.focus * 60);
      }
    );

    document.getElementById('pomStart')?.addEventListener('click', () => {
      const focusInput = document.getElementById('pomFocus');
      const breakInput = document.getElementById('pomBreak');
      Pomodoro.DEFAULTS.focus = Number(focusInput?.value || 25);
      Pomodoro.DEFAULTS.shortBreak = Number(breakInput?.value || 5);
      const subject = document.getElementById('pomSubject')?.value || 'Sin materia';
      Pomodoro.reset();
      Pomodoro.start(subject, Storage.get().currentUserId);
    });
    document.getElementById('pomPause')?.addEventListener('click', () => {
      const st = Pomodoro.getState();
      if (st.mode === 'paused') Pomodoro.resume(); else Pomodoro.pause();
    });
    document.getElementById('pomSkip')?.addEventListener('click', () => Pomodoro.skip());
    document.getElementById('pomReset')?.addEventListener('click', () => Pomodoro.reset());
  }

  // ---- Pantalla: AI Study (Multimedia) ----
  function screenAIStudy() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const subjects = Subjects.listSubjects(user.institutionType || 'colegio', user.id);
    const sessions = Sessions.listFor(user.id);
    const recentFiles = Object.values(s.uploadedFiles || {})
      .filter(f => f.userId === user.id)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice(0, 5);

    const grades = [
      { id: '1ro', label: '1ro de Secundaria' },
      { id: '2do', label: '2do de Secundaria' },
      { id: '3ro', label: '3ro de Secundaria' },
      { id: '4to', label: '4to de Secundaria' },
      { id: '5to', label: '5to de Secundaria' }
    ];

    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const pState = Pomodoro.getState();
    const remaining = pState.remaining || Pomodoro.DEFAULTS.focus * 60;

    const gam = user.gamification || {};
    const hourCount = Math.round((gam.totalMinutesStudied || 0) / 60 * 10) / 10;
    const hoursRound = Math.round(hourCount);

    const levelInfo = Gamification.getLevelInfo(gam.totalXP || 0);
    const streak = Gamification.getStreak(user.id);
    const weekCount = sessions.filter(s => {
      const sDate = new Date(s.createdAt);
      const daysAgo = Math.floor((new Date() - sDate) / (1000 * 60 * 60 * 24));
      return daysAgo < 7;
    }).length;

    const avgConc = sessions.length > 0
      ? (Math.round(sessions.reduce((sum, s) => sum + (s.concentration || 0), 0) / sessions.length * 10) / 10).toFixed(1)
      : 0;

    return `
      <!-- Contenedor principal — Pomodoro ahora es la barra global #pomBar -->
      <div class="ai-unified-wrap">

        <!-- Sub-tabs -->
        <div class="study-tabs">
          <button class="study-tab active" data-tab="Tutor">🤖 Tutor IA</button>
          <button class="study-tab" data-tab="Files">📁 Material de Estudio</button>
        </div>

        <!-- Tab: Tutor IA -->
        <div class="study-tab-panel" id="tabTutor">
          <form id="sessionSetupForm" class="card">
            <div class="row">
              <div class="field">
                <label>Fecha y hora</label>
                <input type="datetime-local" name="datetime" value="${local}" required />
              </div>
              <div class="field">
                <label>Duración (minutos)</label>
                <input type="number" name="durationMin" min="5" max="240" value="30" required />
              </div>
            </div>
            <div class="row">
              <div class="field">
                <label>Curso / materia</label>
                <select name="subject" required>
                  ${subjects.map(x => `<option>${esc(x)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Grado escolar</label>
                <select name="grade" required>
                  ${grades.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field">
              <label>Actividad previa</label>
              <select name="previousActivity" required>
                ${Sessions.PREVIOUS_ACTIVITIES.map(a => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
              <button type="button" class="ghost" id="cancelSessionBtn">Cancelar</button>
              <button class="primary" type="submit">Comenzar sesión con IA ✨</button>
            </div>
          </form>
          <p class="muted" style="font-size:12px;margin-top:12px;text-align:center;">
            La IA evaluará tu concentración y aprendizaje de forma invisible mientras estudias.
          </p>
        </div>

        <!-- Tab: Material de Estudio -->
        <div class="study-tab-panel hidden" id="tabFiles">
          <div class="ai-study-grid">
            <div style="display:flex;flex-direction:column;gap:16px;">
              ${UIComponentsMultimedia.FileUploader('aiStudyUpload', null)}

              ${recentFiles.length > 0 ? `
              <div style="background:var(--bg-2);border-radius:var(--radius,12px);padding:16px;border:1px solid var(--border);">
                <h3 style="margin:0 0 12px;">Archivos recientes</h3>
                <div id="recentFilesList" style="display:flex;flex-direction:column;gap:8px;">
                  ${recentFiles.map(f => UIComponentsMultimedia.FilePreviewCard(f)).join('')}
                </div>
              </div>` : `<div style="background:var(--bg-2);border-radius:var(--radius,12px);padding:16px;border:1px solid var(--border);color:var(--muted);text-align:center;">Aún no hay archivos cargados</div>`}
            </div>

            <div id="chatContainer" class="hidden" style="display:flex;flex-direction:column;">
              ${UIComponentsMultimedia.AIStudyChat('aiStudyChat')}
            </div>
          </div>

          <div id="aiStudyActions" class="hidden ai-action-btns" style="margin-top:16px;">
            <button class="ghost" data-action="summary">📋 Resumen</button>
            <button class="ghost" data-action="questions">❓ Preguntas</button>
            <button class="ghost" data-action="exercises">✏️ Ejercicios</button>
            <button class="ghost" data-action="chat">💬 Conversar</button>
          </div>
        </div>

        <!-- Sección Progreso -->
        <div class="study-progress-grid">
          <div class="progress-card">
            <span class="prog-icon">🔥</span>
            <span class="prog-val" data-count="${streak}">${streak}</span>
            <span class="prog-label">Racha actual</span>
          </div>
          <div class="progress-card">
            <span class="prog-icon">⏱</span>
            <span class="prog-val" data-count="${hoursRound}" data-suffix="h">${hoursRound}h</span>
            <span class="prog-label">Horas estudiadas</span>
          </div>
          <div class="progress-card">
            <span class="prog-icon">⭐</span>
            <span class="prog-val">Nv. ${levelInfo.current.level}</span>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${levelInfo.progressPercent}%"></div>
            </div>
            <span class="prog-label" style="font-size:10px;">${levelInfo.progressPercent}% al siguiente</span>
          </div>
          <div class="progress-card">
            <span class="prog-icon">🎯</span>
            <span class="prog-val">${weekCount}/7</span>
            <span class="prog-label">Sesiones esta semana</span>
          </div>
          <div class="progress-card">
            <span class="prog-icon">📈</span>
            <span class="prog-val">${avgConc}</span>
            <span class="prog-label">Concentración promedio</span>
          </div>
          <div class="progress-card">
            <span class="prog-icon">🏛</span>
            <span class="prog-val">${levelInfo.progressPercent}%</span>
            <span class="prog-label">Progreso nivel</span>
          </div>
        </div>
      </div>`;
  }

  function wireAIStudy() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const chatContainer = document.getElementById('chatContainer');
    const aiStudyActions = document.getElementById('aiStudyActions');
    let currentFileId = null;

    // Pomodoro ahora es la barra global #pomBar (ver wirePomodoroBar en app.js)
    // Mostrar la barra global al entrar a Estudio IA
    window._showPomBar?.();

    // === Material de Estudio: file upload & analysis ===
    UIComponentsMultimedia.wireFileUploader('aiStudyUpload', async (fileRecord) => {
      try {
        currentFileId = fileRecord.id;
        chatContainer.style.display = 'flex';
        aiStudyActions.classList.remove('hidden');

        UIComponentsMultimedia.clearChatMessages('aiStudyChat');
        UIComponentsMultimedia.wireChatMessage('aiStudyChat',
          `Archivo cargado: ${esc(fileRecord.fileName)}. Analizando contenido...`,
          'system');

        const analysis = await GeminiProxy.analyzeFile(fileRecord);

        UIComponentsMultimedia.clearChatMessages('aiStudyChat');
        UIComponentsMultimedia.wireChatMessage('aiStudyChat',
          `✅ Análisis completado para "${esc(fileRecord.fileName)}"`,
          'system');
      } catch (err) {
        UI.flash?.(`Error analizando archivo: ${err.message}`, 'error');
        chatContainer.style.display = 'none';
        aiStudyActions.classList.add('hidden');
      }
    });

    // === Sub-tabs ===
    root().querySelectorAll('.study-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        root().querySelectorAll('.study-tab').forEach(b => b.classList.remove('active'));
        root().querySelectorAll('.study-tab-panel').forEach(p => p.classList.add('hidden'));
        btn.classList.add('active');
        if (tabName === 'Tutor') {
          document.getElementById('tabTutor').classList.remove('hidden');
        } else if (tabName === 'Files') {
          document.getElementById('tabFiles').classList.remove('hidden');
        }
      });
    });

    // === Tutor IA form ===
    const setupForm = document.getElementById('sessionSetupForm');
    const cancelBtn = document.getElementById('cancelSessionBtn');

    setupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(setupForm);
      const metadata = {
        datetime: fd.get('datetime'),
        durationMin: Number(fd.get('durationMin')),
        subject: fd.get('subject'),
        grade: fd.get('grade'),
        previousActivity: fd.get('previousActivity')
      };
      _startAiChat(metadata);
      document.getElementById('tabTutor').scrollIntoView();
    });

    cancelBtn.addEventListener('click', () => {
      setupForm?.reset();
    });

    // === Material de Estudio: Action buttons ===
    root().querySelectorAll('.ai-action-btns button').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!currentFileId) return;
        const action = btn.dataset.action;
        const file = Files.get(currentFileId);
        if (!file) return;

        UIComponentsMultimedia.clearChatMessages('aiStudyChat');
        UIComponentsMultimedia.wireChatMessage('aiStudyChat', `Cargando ${action}...`, 'system');

        const analysis = await GeminiProxy.analyzeFile(file);
        if (!analysis) return;

        if (action === 'summary' && analysis.summary) {
          UIComponentsMultimedia.wireChatMessage('aiStudyChat', analysis.summary, 'content');
        } else if (action === 'questions' && analysis.questions?.length) {
          analysis.questions.forEach((q, i) => {
            UIComponentsMultimedia.wireChatMessage('aiStudyChat', `**P${i+1}:** ${q.text}`, 'content');
            UIComponentsMultimedia.wireChatMessage('aiStudyChat', `**R:** ${q.answer}`, 'answer');
          });
        } else if (action === 'exercises' && analysis.exercises?.length) {
          analysis.exercises.forEach((ex, i) => {
            UIComponentsMultimedia.wireChatMessage('aiStudyChat', `**Ejercicio ${i+1}:** ${ex.title}`, 'content');
            UIComponentsMultimedia.wireChatMessage('aiStudyChat', ex.prompt, 'prompt');
          });
        } else if (action === 'chat') {
          chatContainer.style.display = 'flex';
          UIComponentsMultimedia.wireChatMessage('aiStudyChat', '💬 Escribe tu pregunta sobre el archivo', 'system');
        }
      });
    });

    // === Progreso animado ===
    _wireProgressCounters();
  }

  function _wireProgressCounters() {
    document.querySelectorAll('[data-count]').forEach(el => {
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      let current = 0;
      const step = Math.max(1, Math.ceil(target / 30));
      const interval = setInterval(() => {
        if (current < target) {
          current = Math.min(current + step, target);
          el.textContent = current + suffix;
        } else {
          clearInterval(interval);
        }
      }, 20);
    });
  }

  // ---- Perfil ----
  function screenProfile() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const gam = user.gamification || {};
    const levelInfo = Gamification.getLevelInfo(gam.totalXP || 0);

    return `
      <div class="card">
        <h1>Perfil</h1>
        <div style="padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:20px;">
          <div style="font-size:14px;color:var(--muted);margin-bottom:4px;">Nombre</div>
          <div style="font-size:18px;font-weight:600;">${esc(user.name)}</div>
        </div>
        <div style="padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:20px;">
          <div style="font-size:14px;color:var(--muted);margin-bottom:4px;">Email</div>
          <div style="font-size:18px;font-weight:600;">${esc(user.email || 'N/A')}</div>
        </div>
        <div style="padding:20px 0;">
          <h3 style="margin:0 0 16px;">Estadísticas</h3>
          <ul style="list-style:none;padding:0;margin:0;font-size:14px;display:flex;flex-direction:column;gap:8px;">
            <li>📊 Total XP: <strong>${gam.totalXP || 0}</strong></li>
            <li>⭐ Nivel: <strong>${levelInfo.current.level}</strong></li>
            <li>⏱ Minutos estudiados: <strong>${gam.totalMinutesStudied || 0}</strong></li>
            <li>📝 Sesiones completadas: <strong>${Sessions.listFor(user.id).length}</strong></li>
          </ul>
        </div>
      </div>
    `;
  }

  function wireProfile() {
    // Nothing special to wire
  }

  // ---- Estadísticas ----
  function screenStats() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const sessions = Sessions.listFor(user.id);
    const gam = user.gamification || {};
    const levelInfo = Gamification.getLevelInfo(gam.totalXP || 0);

    const totalConc = sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + (s.concentration || 0), 0) / sessions.length) : 0;
    const avgDuration = sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + (s.durationMin || 0), 0) / sessions.length) : 0;

    return `
      <div class="card">
        <h1>Estadísticas</h1>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px;">
          <div style="background:var(--bg-2);padding:16px;border-radius:var(--radius,12px);text-align:center;">
            <div style="font-size:32px;font-weight:700;color:var(--primary);">${gam.totalXP || 0}</div>
            <div style="font-size:12px;color:var(--muted);">Total XP</div>
          </div>
          <div style="background:var(--bg-2);padding:16px;border-radius:var(--radius,12px);text-align:center;">
            <div style="font-size:32px;font-weight:700;color:var(--primary);">Nv. ${levelInfo.current.level}</div>
            <div style="font-size:12px;color:var(--muted);">Nivel</div>
          </div>
          <div style="background:var(--bg-2);padding:16px;border-radius:var(--radius,12px);text-align:center;">
            <div style="font-size:32px;font-weight:700;color:var(--primary);">${sessions.length}</div>
            <div style="font-size:12px;color:var(--muted);">Sesiones</div>
          </div>
          <div style="background:var(--bg-2);padding:16px;border-radius:var(--radius,12px);text-align:center;">
            <div style="font-size:32px;font-weight:700;color:var(--primary);">${totalConc}/5</div>
            <div style="font-size:12px;color:var(--muted);">Concentración</div>
          </div>
        </div>

        <h3>Sesiones recientes</h3>
        ${sessions.length > 0 ? `
          <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid var(--border);">
                <th style="text-align:left;padding:8px;">Materia</th>
                <th style="text-align:center;padding:8px;">Duración</th>
                <th style="text-align:center;padding:8px;">Concentración</th>
                <th style="text-align:center;padding:8px;">Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${sessions.slice(0, 10).map(s => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:8px;">${esc(s.subject)}</td>
                  <td style="text-align:center;padding:8px;">${s.durationMin}min</td>
                  <td style="text-align:center;padding:8px;">${s.concentration}/5</td>
                  <td style="text-align:center;padding:8px;font-size:11px;color:var(--muted);">${new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<p style="color:var(--muted);">No hay sesiones registradas aún.</p>`}
      </div>
    `;
  }

  function wireStats() {
    // Chart rendering handled by Charts module
  }

  // ---- Ranking ----
  function screenLeaderboard() {
    const s = Storage.get();
    const users = Object.values(s.users || {}).filter(u => u.gamification?.totalXP);
    const sorted = users.sort((a, b) => (b.gamification?.totalXP || 0) - (a.gamification?.totalXP || 0));
    const currentUser = s.users[s.currentUserId];
    const currentRank = sorted.findIndex(u => u.id === currentUser.id) + 1;

    return `
      <div class="card">
        <h1>🏆 Ranking</h1>
        <div style="background:var(--primary);color:white;padding:16px;border-radius:var(--radius,12px);margin-bottom:20px;text-align:center;">
          <div style="font-size:32px;font-weight:700;">Tu posición: #${currentRank}</div>
          <div style="font-size:14px;opacity:0.9;margin-top:4px;">${currentUser.gamification?.totalXP || 0} XP</div>
        </div>

        ${sorted.length > 0 ? `
          <ol style="list-style:none;padding:0;margin:0;">
            ${sorted.map((u, i) => `
              <li style="padding:12px;background:${i === currentRank - 1 ? 'var(--bg-2)' : ''};border-radius:var(--radius,8px);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-weight:600;font-size:14px;">#${i + 1} ${esc(u.name)}</div>
                  <div style="font-size:12px;color:var(--muted);">Nv. ${Gamification.getLevelInfo(u.gamification?.totalXP || 0).current.level}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:700;font-size:16px;color:var(--primary);">${u.gamification?.totalXP || 0}</div>
                  <div style="font-size:11px;color:var(--muted);">XP</div>
                </div>
              </li>
            `).join('')}
          </ol>
        ` : `<p style="color:var(--muted);">No hay datos aún.</p>`}
      </div>
    `;
  }

  function wireLeaderboard() {
    // Static page, nothing to wire
  }

  // ---- Historia de sesiones ----
  function screenHistory() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const sessions = Sessions.listFor(user.id);

    return `
      <div class="card">
        <h1>📖 Historial</h1>
        ${sessions.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${sessions.map((sess, i) => `
              <div style="background:var(--bg-2);border:1px solid var(--border);padding:16px;border-radius:var(--radius,12px);">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                  <div>
                    <div style="font-weight:600;font-size:15px;">${esc(sess.subject)}</div>
                    <div style="font-size:12px;color:var(--muted);">${new Date(sess.createdAt).toLocaleString()}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:20px;font-weight:700;">${sess.concentration}/5</div>
                    <div style="font-size:11px;color:var(--muted);">Concentración</div>
                  </div>
                </div>
                <div style="font-size:12px;color:var(--muted);">
                  ⏱ ${sess.durationMin} min · 📚 Grado ${sess.grade} · XP +${sess.xpEarned || 0}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<p style="color:var(--muted);">Sin historial de sesiones aún.</p>`}
      </div>
    `;
  }

  function wireHistory() {
    // Static list, nothing to wire
  }

  // ---- Recomendaciones ----
  function screenRecommend() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const recs = Recommend.getForUser(user.id);

    return `
      <div class="card">
        <h1>💡 Recomendaciones Personalizadas</h1>
        ${recs.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${recs.map(r => `
              <div style="background:var(--bg-2);padding:16px;border-radius:var(--radius,12px);border-left:4px solid var(--primary);">
                <div style="font-weight:600;font-size:14px;margin-bottom:4px;">🎯 ${esc(r.title)}</div>
                <div style="font-size:12px;color:var(--muted);">${esc(r.description)}</div>
              </div>
            `).join('')}
          </div>
        ` : `<p style="color:var(--muted);">Completa más sesiones para obtener recomendaciones personalizadas.</p>`}
      </div>
    `;
  }

  function wireRecommend() {
    // Static recommendations
  }

  // ---- Logros ----
  function screenAchievements() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const badges = Gamification.listBadges();

    return `
      <div class="card">
        <h1>🏅 Logros</h1>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:16px;">
          ${badges.map(b => {
            const earned = (user.gamification?.badges || []).includes(b.id);
            return `
              <div style="text-align:center;opacity:${earned ? '1' : '0.3'};cursor:pointer;" title="${esc(b.label)}">
                <div style="font-size:40px;margin-bottom:4px;">${b.emoji}</div>
                <div style="font-size:10px;color:var(--muted);">${esc(b.label)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function wireAchievements() {
    // Static achievement list
  }

  // ---- Aprobación pendiente ----
  function screenPendingApproval() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const classroom = user.classroomId ? s.classrooms?.[user.classroomId] : null;

    return `
      <div class="card" style="max-width:400px;margin:60px auto;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">⏳</div>
        <h1>Pendiente de Aprobación</h1>
        <p style="color:var(--muted);margin-bottom:16px;">
          Tu solicitud para unirte a <strong>${classroom ? esc(classroom.name) : 'el aula'}</strong> está siendo revisada por tu docente.
        </p>
        <p style="color:var(--muted);font-size:12px;">
          Volveremos a verificar cada vez que ingreses. Gracias por tu paciencia.
        </p>
      </div>
    `;
  }

  function wirePendingApproval() {
    // Nothing to wire
  }

  // ---- Institución ----
  function screenInstitution() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const school = user.schoolId ? s.schools?.[user.schoolId] : null;
    const classroom = user.classroomId ? s.classrooms?.[user.classroomId] : null;

    return `
      <div class="card">
        <h1>🏫 Mi Institución</h1>
        ${school ? `
          <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--border);">
            <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Colegio</div>
            <div style="font-size:16px;font-weight:600;">${esc(school.name)}</div>
          </div>
        ` : ''}
        ${classroom ? `
          <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--border);">
            <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Aula</div>
            <div style="font-size:16px;font-weight:600;">${esc(classroom.name)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px;">Docente: ${esc(classroom.teacherName || 'N/A')}</div>
          </div>
        ` : ''}
        <form id="changeClassroomForm" style="margin-top:20px;">
          <div style="margin-bottom:12px;">
            <label style="font-size:12px;color:var(--muted);">Cambiar de aula (código)</label>
            <input type="text" name="targetCode" placeholder="Ej. 4A2024" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius,8px);margin-top:4px;" />
          </div>
          <button type="submit" class="primary" style="width:100%;">Solicitar cambio</button>
        </form>
        <form id="joinClassroomForm" style="margin-top:16px;">
          <div style="margin-bottom:12px;">
            <label style="font-size:12px;color:var(--muted);">Unirse a un aula (código)</label>
            <input type="text" name="inviteCode" placeholder="Código de invitación" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius,8px);margin-top:4px;" />
          </div>
          <button type="submit" class="primary" style="width:100%;">Enviar solicitud</button>
        </form>
      </div>
    `;
  }

  function wireInstitution() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];

    document.getElementById('changeClassroomForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = new FormData(e.target).get('targetCode').trim().toUpperCase();
      const cr = Schools.findClassroomByCode(code);
      if (!cr) return UI.flash('Código de aula inválido.', 'error');
      if (cr.id === user.classroomId) return UI.flash('Ya perteneces a esa aula.', 'error');
      Schools.createChangeRequest(user.id, cr.id);
      UI.flash('Solicitud enviada. Tu docente recibirá la notificación.', 'success');
      App.go('profile');
    });

    document.getElementById('joinClassroomForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = new FormData(e.target).get('inviteCode').trim().toUpperCase();
      const cr = Schools.findClassroomByCode(code);
      if (!cr) return UI.flash('Código de invitación inválido.', 'error');
      if (cr.schoolId !== user.schoolId) return UI.flash('El aula no pertenece a tu colegio.', 'error');
      Schools.createJoinRequest(user.id, user.schoolId, cr.id);
      UI.flash('Solicitud enviada. Tu docente recibirá la notificación.', 'success');
      App.go('pending-approval');
    });
  }

  // ---- Utilidades ----
  function root() {
    return document.getElementById('app');
  }

  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    screens: {
      'dashboard':          { render: screenDashboard,          wire: wireDashboard },
      'new-session':        { render: screenNewSession,         wire: wireNewSession },
      'pomodoro':           { render: screenPomodoro,           wire: wirePomodoro },
      'ai-study':           { render: screenAIStudy,            wire: wireAIStudy },
      'history':            { render: screenHistory,            wire: wireHistory },
      'stats':              { render: screenStats,              wire: wireStats },
      'recommend':          { render: screenRecommend,          wire: wireRecommend },
      'achievements':       { render: screenAchievements,       wire: wireAchievements },
      'leaderboard':        { render: screenLeaderboard,        wire: wireLeaderboard },
      'profile':            { render: screenProfile,            wire: wireProfile },
      'institution':        { render: screenInstitution,        wire: wireInstitution },
      'pending-approval':   { render: screenPendingApproval,    wire: wirePendingApproval }
    }
  };
})();
