// Pantallas del rol Estudiante.
const UIStudent = (() => {

  const root = () => document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function showXpToast(xpEarned, newBadges) {
    const el = document.createElement('div');
    el.className = 'xp-toast';
    el.innerHTML = `<strong>+${xpEarned} XP</strong>` +
      (newBadges && newBadges.length ? `<br>🏆 ${newBadges.map(b => b.label).join(', ')}` : '');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  // ---- Pantalla: Pendiente de aprobación ----
  function screenPendingApproval() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const school = user.schoolId ? s.schools[user.schoolId] : null;
    const isRejected = user.approvalStatus === 'rejected';
    const requests = Schools.getStudentRequests(user.id);
    const lastReq = requests[0] || null;

    const statusBadge = isRejected
      ? '<span class="rejected-badge">❌ Rechazada</span>'
      : '<span class="pending-badge">Pendiente</span>';

    const iconEl = isRejected ? '❌' : '⏳';
    const title = isRejected ? 'Solicitud rechazada' : 'Pendiente de aprobación';
    const desc = isRejected
      ? 'Tu solicitud de ingreso fue rechazada. Contacta a tu docente para más información o intenta con un nuevo código de aula.'
      : `Tu solicitud de ingreso al colegio <strong>${esc(school?.name || '')}</strong> está siendo revisada. Cuando tu docente la apruebe, tendrás acceso completo.`;

    return `
      <div style="max-width:520px;margin:50px auto;text-align:center;">
        <div style="font-size:64px;margin-bottom:16px;line-height:1;">${iconEl}</div>
        <h1 style="margin-bottom:8px;">${title}</h1>
        <p class="muted" style="font-size:15px;line-height:1.7;margin-bottom:28px;">${desc}</p>

        <div class="card" style="text-align:left;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:600;font-size:14px;">Estado de tu solicitud</span>
            ${statusBadge}
          </div>
          ${school ? `<p class="muted" style="font-size:13px;margin:4px 0;">Colegio: <strong style="color:var(--text);">${esc(school.name)}</strong></p>` : ''}
          ${lastReq ? `<p class="muted" style="font-size:12px;margin:4px 0;">Enviada: ${new Date(lastReq.createdAt).toLocaleString('es-PE')}</p>` : ''}
          ${lastReq?.classroomId && s.classrooms[lastReq.classroomId] ? `<p class="muted" style="font-size:12px;margin:4px 0;">Aula solicitada: <strong>${esc(s.classrooms[lastReq.classroomId].name)}</strong></p>` : ''}
        </div>

        <div class="card" style="text-align:left;margin-bottom:16px;">
          <h3>¿Qué hacer ahora?</h3>
          <p class="muted" style="font-size:13px;line-height:1.6;">
            ${isRejected
              ? 'Habla con tu docente para que genere un código de invitación de aula y te lo comparta. Luego usa "Ingresar con código" para enviar una nueva solicitud.'
              : 'Avísale a tu docente que enviaste la solicitud. Cuando la apruebe, podrás iniciar sesión normalmente y acceder a todas las funciones.'}
          </p>
        </div>

        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button class="ghost" id="checkStatusBtn">↻ Verificar estado</button>
          <button class="ghost danger-ghost" id="logoutPendingBtn">Cerrar sesión</button>
        </div>
      </div>`;
  }

  function wirePendingApproval() {
    document.getElementById('checkStatusBtn')?.addEventListener('click', () => {
      const user = Storage.get().users[Storage.get().currentUserId];
      if (user.approvalStatus === 'approved') {
        App.go('dashboard');
        UI.flash('¡Tu solicitud fue aprobada! Bienvenido al sistema.', 'success');
      } else {
        UI.flash('Tu solicitud aún está pendiente. El docente recibirá tu solicitud cuando inicie sesión.', 'info');
      }
    });
    document.getElementById('logoutPendingBtn')?.addEventListener('click', () => {
      Auth.logout();
      App.go('welcome');
    });
  }

  // ---- Pantalla: Selección de institución ----
  function screenInstitution() {
    const list = Subjects.listInstitutions();
    return `
      <h1>Selecciona tu tipo de institución</h1>
      <p class="muted">Las materias se cargarán automáticamente según tu elección.</p>
      <div class="choice-grid" style="margin-top:18px;">
        ${list.map(i => `
          <div class="choice ${i.enabled ? '' : 'disabled'}" data-id="${esc(i.id)}">
            <div class="ic">${i.icon}</div>
            <h2 style="margin:8px 0 4px;">${esc(i.label)}</h2>
            <p class="muted" style="margin:0;font-size:12px;">${i.enabled ? 'Disponible' : 'Próximamente'}</p>
          </div>`).join('')}
      </div>`;
  }

  function wireInstitution() {
    root().querySelectorAll('.choice:not(.disabled)').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const userId = Storage.get().currentUserId;
        Storage.set(s => { s.users[userId].institutionType = id; });
        App.go('dashboard');
      });
    });
  }

  // ---- Pantalla: Dashboard ----
  function screenDashboard() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const inst = Subjects.getInstitution(user.institutionType);
    const sessions = Sessions.listFor(user.id);
    const sum = Stats.summary(sessions);
    const gam = user.gamification || {};
    const levelInfo = Gamification.getLevelInfo(gam.xp || 0);
    const alerts = Analytics.generateAlerts(user.id);
    const weekXP = Gamification.getWeeklyXP(user.id);

    // Leaderboard del aula (top 5)
    let leaderboardHtml = '';
    if (user.classroomId) {
      const lb = Gamification.getLeaderboard('classroom', user.classroomId, 'week').slice(0, 5);
      if (lb.length > 0) {
        leaderboardHtml = `
          <div class="card" style="margin-top:0;">
            <h3>🏅 Ranking del Aula (esta semana)</h3>
            <table class="table">
              <thead><tr><th>#</th><th>Estudiante</th><th>XP</th><th>Racha</th></tr></thead>
              <tbody>
                ${lb.map(e => `
                  <tr class="${e.userId === user.id ? 'self-row' : ''}">
                    <td class="rank-medal-${e.rank}">${e.rank <= 3 ? ['🥇','🥈','🥉'][e.rank-1] : e.rank}</td>
                    <td><span class="avatar-initials">${esc(e.name.slice(0,2).toUpperCase())}</span> ${esc(e.name)}</td>
                    <td><strong>${e.xp}</strong></td>
                    <td>🔥 ${e.streak}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <button class="ghost" style="margin-top:10px;width:100%;" data-go="leaderboard">Ver ranking completo</button>
          </div>`;
      }
    }

    return `
      ${alerts.map(a => `<div class="alert ${a.type === 'success' ? 'success' : a.type === 'error' ? 'error' : 'info'}">${a.msg}</div>`).join('')}

      <div class="student-hero">
        <div class="xp-section">
          <div class="level-badge-wrap">
            <div class="level-badge">Nv.<br>${levelInfo.current.level}</div>
            <div style="flex:1;">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                <span style="font-weight:600;color:var(--text);">${esc(levelInfo.current.title)}</span>
                <span class="muted">${gam.xp || 0} XP</span>
              </div>
              <div class="xp-bar-wrap">
                <div class="xp-bar" style="width:${levelInfo.progress}%"></div>
              </div>
              ${levelInfo.next ? `<div class="xp-label">${levelInfo.progress}% hacia ${esc(levelInfo.next.title)} (${levelInfo.next.xpRequired} XP)</div>` : '<div class="xp-label">¡Nivel máximo alcanzado!</div>'}
            </div>
          </div>
        </div>
        <div class="streak-widget">
          <span class="streak-fire">🔥</span>
          <span class="streak-count">${gam.streak || 0}</span>
          <span class="streak-label">días<br>seguidos</span>
        </div>
        <div class="streak-widget">
          <span class="streak-fire">⚡</span>
          <span class="streak-count" style="color:var(--accent);">${weekXP}</span>
          <span class="streak-label">XP<br>esta semana</span>
        </div>
      </div>

      <h1>Hola, ${esc(user.name)} 👋</h1>
      ${user.institutionType ? `<p class="muted">Institución: <strong>${esc(inst?.label || user.institutionType)}</strong>${user.classroomId && s.classrooms[user.classroomId] ? ` · Aula: <strong>${esc(s.classrooms[user.classroomId].name)}</strong>` : ''}</p>` : ''}

      <div class="grid cols-4" style="margin:16px 0 4px;">
        <div class="kpi"><div class="v">${sum.total}</div><div class="l">Sesiones</div></div>
        <div class="kpi"><div class="v">${sum.avgConc || '—'}</div><div class="l">Concentración prom.</div></div>
        <div class="kpi"><div class="v">${sum.totalMin}</div><div class="l">Minutos totales</div></div>
        <div class="kpi"><div class="v">${sum.avgDur || '—'}</div><div class="l">Min/sesión prom.</div></div>
      </div>

      <div class="grid cols-3" style="margin-top:18px;">
        <div class="card">
          <h2>📝 Registrar sesión</h2>
          <p class="muted">Anota tu última sesión de estudio.</p>
          <button class="primary" data-go="new-session">Nueva sesión</button>
        </div>
        <div class="card">
          <h2>🍅 Pomodoro</h2>
          <p class="muted">Timer de enfoque con registro automático.</p>
          <button class="primary" data-go="pomodoro">Iniciar Pomodoro</button>
        </div>
        <div class="card">
          <h2>🏆 Logros</h2>
          <p class="muted">${(gam.badges || []).length} insignias desbloqueadas.</p>
          <button class="ghost" data-go="achievements">Ver logros</button>
        </div>
        <div class="card">
          <h2>📊 Estadísticas</h2>
          <p class="muted">Promedios, gráficas y tendencias.</p>
          <button class="ghost" data-go="stats">Ver estadísticas</button>
        </div>
        <div class="card">
          <h2>💡 Recomendaciones</h2>
          <p class="muted">Consejos basados en tus datos.</p>
          <button class="ghost" data-go="recommend">Ver recomendaciones</button>
        </div>
        <div class="card">
          <h2>👤 Mi Perfil</h2>
          <p class="muted">Perfil de aprendizaje y resumen.</p>
          <button class="ghost" data-go="profile">Ver perfil</button>
        </div>
      </div>

      ${leaderboardHtml}`;
  }

  function wireDashboard() {
    root().querySelectorAll('[data-go]').forEach(b =>
      b.addEventListener('click', () => App.go(b.dataset.go)));
  }

  // ---- Pantalla: Nueva sesión ----
  function screenNewSession() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const subjects = Subjects.listSubjects(user.institutionType || 'colegio', user.id);
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    return `
      <h1>Registrar sesión de estudio</h1>
      <form id="sessionForm" class="card">
        <div class="row">
          <div class="field">
            <label>Fecha y hora</label>
            <input type="datetime-local" name="datetime" value="${local}" required />
          </div>
          <div class="field">
            <label>Duración (minutos)</label>
            <input type="number" name="durationMin" min="1" max="600" value="30" required />
          </div>
        </div>
        <div class="field">
          <label>Curso / materia</label>
          <select name="subject" required>
            ${subjects.map(x => `<option>${esc(x)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Nivel de concentración</label>
          <div class="likert">
            ${Sessions.LIKERT.map(l => `
              <label title="${esc(l.label)}">
                <input type="radio" name="concentration" value="${l.v}" ${l.v === 3 ? 'checked' : ''} required />
                <div class="lk-num">${l.v}</div>
                <div class="lk-txt">${esc(l.label)}</div>
              </label>`).join('')}
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Actividad previa</label>
            <select name="previousActivity" id="prevAct" required>
              ${Sessions.PREVIOUS_ACTIVITIES.map(a => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field" id="otherWrap" style="display:none;">
            <label>Especificar otra</label>
            <input name="previousActivityOther" placeholder="Ej. ducharme" />
          </div>
        </div>
        <div class="field">
          <label>Comentario (opcional)</label>
          <textarea name="comment" placeholder="¿Qué notaste? ¿Distracciones, ambiente, energía?"></textarea>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button type="button" class="ghost" data-go="dashboard">Cancelar</button>
          <button class="primary" type="submit">Guardar sesión</button>
        </div>
      </form>`;
  }

  function wireNewSession() {
    const form = document.getElementById('sessionForm');
    const prev = document.getElementById('prevAct');
    const other = document.getElementById('otherWrap');
    prev.addEventListener('change', () => { other.style.display = prev.value === 'otra' ? '' : 'none'; });
    root().querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => App.go(b.dataset.go)));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const s = Storage.get();
      const user = s.users[s.currentUserId];
      try {
        const { record, gamResult } = Sessions.add({
          email: user.id,
          datetime: new Date(fd.get('datetime')).toISOString(),
          institutionType: user.institutionType || 'colegio',
          subject: fd.get('subject'),
          concentration: fd.get('concentration'),
          durationMin: fd.get('durationMin'),
          previousActivity: fd.get('previousActivity'),
          previousActivityOther: fd.get('previousActivityOther') || '',
          comment: fd.get('comment') || ''
        });
        App.go('dashboard');
        UI.flash('Sesión guardada correctamente. ¡Sigue así!', 'success');
        showXpToast(gamResult.xpEarned, gamResult.newBadges);
      } catch (err) {
        UI.flash(err.message, 'error');
      }
    });
  }

  // ---- Pantalla: Materias ----
  function screenSubjects() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const base = s.subjectsByInstitution[user.institutionType || 'colegio'] || [];
    const custom = s.customSubjects[user.id] || [];

    return `
      <h1>Materias</h1>
      <p class="muted">Materias disponibles para tu institución. Puedes agregar cursos personalizados.</p>
      <div class="card">
        <h3>Materias predefinidas</h3>
        <div>${base.map(x => `<span class="chip">${esc(x)}</span>`).join('') || '<span class="muted">Ninguna</span>'}</div>
      </div>
      <div class="card">
        <h3>Cursos personalizados</h3>
        <div id="customList">${custom.map(x => `<span class="chip">${esc(x)}<span class="x" data-del="${esc(x)}">✕</span></span>`).join('') || '<span class="muted">Aún no agregaste cursos.</span>'}</div>
        <form id="addSubjectForm" style="margin-top:14px;display:flex;gap:8px;">
          <input name="subject" placeholder="Ej. Robótica, Filosofía…" style="flex:1;background:var(--bg-2);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px;" />
          <button class="primary" type="submit">Agregar</button>
        </form>
      </div>`;
  }

  function wireSubjects() {
    const userId = Storage.get().currentUserId;
    document.getElementById('addSubjectForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = new FormData(e.target).get('subject');
      try { Subjects.addCustomSubject(userId, name); App.go('subjects'); UI.flash('Curso agregado.', 'success'); }
      catch (err) { UI.flash(err.message, 'error'); }
    });
    root().querySelectorAll('[data-del]').forEach(el => {
      el.addEventListener('click', () => { Subjects.removeCustomSubject(userId, el.dataset.del); App.go('subjects'); });
    });
  }

  // ---- Pantalla: Historial ----
  function screenHistory(filters = {}) {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const subjects = Subjects.listSubjects(user.institutionType || 'colegio', user.id);
    const list = Sessions.listFor(user.id, filters);

    return `
      <h1>Historial de sesiones</h1>
      <div class="toolbar">
        <div class="filters">
          <select id="fSubject">
            <option value="">Todas las materias</option>
            ${subjects.map(x => `<option ${filters.subject === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          </select>
          <input type="date" id="fFrom" value="${filters.fromDate || ''}" />
          <input type="date" id="fTo" value="${filters.toDate || ''}" />
          <button class="ghost" id="applyF">Aplicar</button>
          <button class="ghost" id="clearF">Limpiar</button>
        </div>
        <button class="primary" id="exportBtn">Exportar CSV</button>
      </div>
      <div class="card" style="padding:0;overflow:auto;">
        ${list.length === 0 ? '<div class="empty">No hay sesiones con esos filtros.</div>' : `
        <table class="table">
          <thead><tr>
            <th>Fecha</th><th>Materia</th><th>Conc.</th><th>Min</th><th>Actividad previa</th><th>Comentario</th><th></th>
          </tr></thead>
          <tbody>
            ${list.map(x => `
              <tr>
                <td>${new Date(x.datetime).toLocaleString('es-PE')}</td>
                <td>${esc(x.subject)}</td>
                <td><strong>${x.concentration}</strong>/5</td>
                <td>${x.durationMin}</td>
                <td>${esc(x.previousActivity)}${x.previousActivityOther ? ' — '+esc(x.previousActivityOther) : ''}</td>
                <td>${esc(x.comment)}</td>
                <td><button class="danger" data-rm="${x.id}">Eliminar</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`}
      </div>`;
  }

  function wireHistory() {
    const userId = Storage.get().currentUserId;
    document.getElementById('applyF').addEventListener('click', () => {
      const subject = document.getElementById('fSubject').value;
      const fromDate = document.getElementById('fFrom').value;
      const toDate = document.getElementById('fTo').value;
      App._historyFilters = { subject, fromDate, toDate,
        from: fromDate ? new Date(fromDate).toISOString() : '',
        to: toDate ? new Date(toDate + 'T23:59:59').toISOString() : '' };
      App.go('history');
    });
    document.getElementById('clearF').addEventListener('click', () => { App._historyFilters = {}; App.go('history'); });
    document.getElementById('exportBtn').addEventListener('click', () => {
      const list = Sessions.listFor(userId, App._historyFilters || {});
      if (!list.length) return UI.flash('No hay sesiones para exportar.', 'error');
      Exporter.exportSessions(list);
    });
    root().querySelectorAll('[data-rm]').forEach(b => {
      b.addEventListener('click', () => {
        if (!confirm('¿Eliminar esta sesión?')) return;
        Sessions.remove(b.dataset.rm);
        App.go('history');
      });
    });
  }

  // ---- Pantalla: Estadísticas ----
  function screenStats() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const sessions = Sessions.listFor(user.id);

    if (!sessions.length) {
      return `<h1>Estadísticas</h1><div class="card empty">Aún no tienes sesiones registradas. <a href="#" data-go="new-session" style="color:var(--accent);">Registra tu primera sesión.</a></div>`;
    }

    const sum = Stats.summary(sessions);
    const subs = Stats.bySubject(sessions);
    const buckets = Stats.byHourBucket(sessions);
    const acts = Stats.byPreviousActivity(sessions);
    const dist = Stats.likertDistribution(sessions);
    const total = sessions.length;

    const renderBar = (rows, key) => rows.map(r => {
      const pct = (r.avgConcentration / 5) * 100;
      return `<div>
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <span>${esc(r[key])}</span>
          <span class="muted">${r.avgConcentration}/5 · ${r.count} ses.</span>
        </div>
        <div class="bar"><span style="width:${pct}%"></span></div>
      </div>`;
    }).join('');

    return `
      <h1>Estadísticas</h1>
      <div class="grid cols-4">
        <div class="kpi"><div class="v">${sum.total}</div><div class="l">Sesiones</div></div>
        <div class="kpi"><div class="v">${sum.avgConc}</div><div class="l">Concentración prom.</div></div>
        <div class="kpi"><div class="v">${sum.totalMin}</div><div class="l">Min totales</div></div>
        <div class="kpi"><div class="v">${sum.avgDur}</div><div class="l">Min prom./sesión</div></div>
      </div>

      <div class="card" style="margin-top:18px;">
        <h3>Actividad semanal (últimas 52 semanas)</h3>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">Menos →→ Más actividad</div>
        ${Charts.heatmapGrid(sessions)}
      </div>

      <div class="grid cols-2" style="margin-top:18px;">
        <div class="card">
          <h2>Concentración por materia</h2>
          <div class="chart-container">
            <canvas id="chartSubject"></canvas>
          </div>
        </div>
        <div class="card">
          <h2>Distribución Likert</h2>
          <div class="chart-container">
            <canvas id="chartLikert"></canvas>
          </div>
        </div>
        <div class="card">
          <h2>Por franja horaria</h2>
          ${renderBar(buckets, 'bucket')}
        </div>
        <div class="card">
          <h2>Por actividad previa</h2>
          ${renderBar(acts, 'activity')}
        </div>
      </div>`;
  }

  function wireStats() {
    root().querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); App.go(b.dataset.go); }));

    const s = Storage.get();
    const sessions = Sessions.listFor(s.currentUserId);
    if (!sessions.length) return;

    const subs = Stats.bySubject(sessions);
    if (subs.length > 0) {
      Charts.create('chartSubject', Charts.barConfig(
        subs.map(r => r.subject),
        subs.map(r => r.avgConcentration),
        'Concentración prom.',
        Charts.COLORS.primary
      ));
    }

    const dist = Stats.likertDistribution(sessions);
    Charts.create('chartLikert', Charts.doughnutConfig(
      Sessions.LIKERT.map(l => l.label),
      Sessions.LIKERT.map(l => dist[l.v] || 0)
    ));
  }

  // ---- Pantalla: Recomendaciones ----
  function screenRecommend() {
    const s = Storage.get();
    const sessions = Sessions.listFor(s.currentUserId);
    const tips = Analytics.buildRecommendations(sessions);
    const oldTips = Recommend.build(sessions);
    const allTips = [...tips, ...oldTips.filter(t => !tips.some(n => n.text === t.text))];

    return `
      <h1>Recomendaciones personalizadas</h1>
      <p class="muted">Basadas en tus ${sessions.length} sesión${sessions.length === 1 ? '' : 'es'} registrada${sessions.length === 1 ? '' : 's'}.</p>
      <div style="margin-top:14px;">
        ${allTips.map(t => `<div class="alert ${t.type}">${esc(t.text || t.msg || '')}</div>`).join('')}
      </div>`;
  }

  // ---- Pantalla: Logros ----
  function screenAchievements() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const earned = new Set((user.gamification?.badges) || []);

    return `
      <h1>Logros e Insignias</h1>
      <p class="muted">Desbloquea insignias completando desafíos y manteniendo constancia.</p>

      <div style="margin:12px 0;display:flex;gap:12px;flex-wrap:wrap;">
        <div class="kpi" style="min-width:120px;">
          <div class="v">${earned.size}</div>
          <div class="l">Desbloqueadas</div>
        </div>
        <div class="kpi" style="min-width:120px;">
          <div class="v">${Gamification.BADGES.length - earned.size}</div>
          <div class="l">Por obtener</div>
        </div>
        <div class="kpi" style="min-width:120px;">
          <div class="v">${user.gamification?.xp || 0}</div>
          <div class="l">XP total</div>
        </div>
      </div>

      <div class="badges-grid">
        ${Gamification.BADGES.map(b => `
          <div class="badge-card ${earned.has(b.id) ? '' : 'locked'}">
            <span class="badge-icon">${b.icon}</span>
            <div class="badge-name">${esc(b.label)}</div>
            <div class="badge-desc">${esc(b.desc)}</div>
            ${earned.has(b.id) ? '<div class="badge-date">✓ Obtenida</div>' : '<div class="badge-date" style="color:var(--muted);">Bloqueada</div>'}
          </div>`).join('')}
      </div>`;
  }

  // ---- Pantalla: Leaderboard ----
  function screenLeaderboard() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const scope = App._lbScope || 'classroom';
    const period = App._lbPeriod || 'week';

    let scopeId = null;
    let scopeLabel = 'Global';
    let hasClassroom = !!user.classroomId;
    let hasSchool = !!user.schoolId;

    if (scope === 'classroom' && user.classroomId) {
      scopeId = user.classroomId;
      scopeLabel = s.classrooms[user.classroomId]?.name || 'Mi Aula';
    } else if (scope === 'school' && user.schoolId) {
      scopeId = user.schoolId;
      scopeLabel = s.schools[user.schoolId]?.name || 'Mi Colegio';
    }

    const lb = Gamification.getLeaderboard(
      (scope === 'classroom' && !user.classroomId) ? 'global' : scope,
      scopeId,
      period
    );

    const scopeOptions = [
      hasClassroom ? `<button class="tab-btn ${scope === 'classroom' ? 'active' : ''}" data-scope="classroom">Mi Aula</button>` : '',
      hasSchool    ? `<button class="tab-btn ${scope === 'school' ? 'active' : ''}" data-scope="school">Mi Colegio</button>` : '',
      `<button class="tab-btn ${scope === 'global' ? 'active' : ''}" data-scope="global">Global</button>`
    ].filter(Boolean).join('');

    return `
      <h1>🏆 Ranking</h1>
      <div class="tab-bar">${scopeOptions}</div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="ghost ${period === 'week' ? 'active-filter' : ''}" data-period="week">Esta semana</button>
        <button class="ghost ${period === 'month' ? 'active-filter' : ''}" data-period="month">Este mes</button>
        <button class="ghost ${period === 'all' ? 'active-filter' : ''}" data-period="all">Total</button>
      </div>

      <div class="card" style="padding:0;overflow:auto;">
        ${lb.length === 0 ? '<div class="empty">No hay datos de ranking todavía.</div>' : `
        <table class="leaderboard-table">
          <thead><tr>
            <th style="padding:12px 16px;">#</th>
            <th style="padding:12px 8px;">Estudiante</th>
            <th style="padding:12px 8px;">XP</th>
            <th style="padding:12px 8px;">Nivel</th>
            <th style="padding:12px 8px;">Racha</th>
            <th style="padding:12px 8px;">Sesiones</th>
          </tr></thead>
          <tbody>
            ${lb.map(e => `
              <tr class="${e.userId === user.id ? 'self' : ''}">
                <td style="padding:12px 16px;" class="rank-medal-${e.rank}">${e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank}</td>
                <td style="padding:12px 8px;"><span class="avatar-initials">${esc(e.name.slice(0,2).toUpperCase())}</span> ${esc(e.name)}</td>
                <td style="padding:12px 8px;"><strong>${e.xp}</strong></td>
                <td style="padding:12px 8px;"><span class="chip">Nv.${e.level}</span></td>
                <td style="padding:12px 8px;">🔥 ${e.streak}</td>
                <td style="padding:12px 8px;">${e.sessionCount}</td>
              </tr>`).join('')}
          </tbody>
        </table>`}
      </div>`;
  }

  function wireLeaderboard() {
    root().querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { App._lbScope = btn.dataset.scope; App.go('leaderboard'); });
    });
    root().querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => { App._lbPeriod = btn.dataset.period; App.go('leaderboard'); });
    });
  }

  // ---- Pantalla: Pomodoro ----
  function screenPomodoro() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const subjects = Subjects.listSubjects(user.institutionType || 'colegio', user.id);
    const pState = Pomodoro.getState();
    const remaining = pState.remaining || Pomodoro.DEFAULTS.focus * 60;

    return `
      <h1>🍅 Timer Pomodoro</h1>
      <div class="pomodoro-wrap">
        <div class="timer-display" id="timerDisplay">${Pomodoro.formatTime(remaining)}</div>
        <div class="timer-mode" id="timerMode">Listo para enfocar</div>
        <div class="cycle-dots" id="cycleDots">
          ${Array.from({length: Math.min(pState.cycleCount || 0, 8)}, () => '<span class="done">●</span>').join('')}
        </div>

        <div class="field" style="margin-top:20px;max-width:300px;margin-left:auto;margin-right:auto;">
          <label>Materia a estudiar</label>
          <select id="pomSubject">
            ${subjects.map(x => `<option>${esc(x)}</option>`).join('')}
          </select>
        </div>

        <div class="timer-controls">
          <button class="primary" id="pomStart">▶ Iniciar</button>
          <button class="ghost" id="pomPause">⏸ Pausar</button>
          <button class="ghost" id="pomSkip">⏭ Saltar</button>
          <button class="ghost" id="pomReset">↺ Reiniciar</button>
        </div>

        <div class="card" style="margin-top:24px;text-align:left;max-width:340px;margin-left:auto;margin-right:auto;">
          <h3>Configuración</h3>
          <div class="row">
            <div class="field">
              <label>Enfoque (min)</label>
              <input type="number" id="focusDur" value="${Pomodoro.DEFAULTS.focus}" min="1" max="120" />
            </div>
            <div class="field">
              <label>Descanso (min)</label>
              <input type="number" id="breakDur" value="${Pomodoro.DEFAULTS.shortBreak}" min="1" max="30" />
            </div>
          </div>
        </div>

        <p class="muted" style="margin-top:16px;font-size:12px;">Al completar un ciclo de enfoque se te pedirá registrar tu concentración y la sesión se guardará automáticamente.</p>
      </div>

      <!-- Modal de concentración -->
      <div id="pomModal" class="pom-modal hidden">
        <div class="pom-modal-inner card">
          <h2>🍅 ¡Ciclo completado!</h2>
          <p>¿Qué nivel de concentración tuviste?</p>
          <div class="likert" id="pomLikert">
            ${Sessions.LIKERT.map(l => `
              <label title="${esc(l.label)}">
                <input type="radio" name="pomConc" value="${l.v}" ${l.v === 3 ? 'checked' : ''} />
                <div class="lk-num">${l.v}</div>
                <div class="lk-txt">${esc(l.label)}</div>
              </label>`).join('')}
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
            <button class="ghost" id="pomSkipLog">Saltar registro</button>
            <button class="primary" id="pomSaveSession">Guardar sesión</button>
          </div>
        </div>
      </div>`;
  }

  function wirePomodoro() {
    const s = Storage.get();
    const userId = s.currentUserId;

    function updateDisplay(remaining, mode) {
      const display = document.getElementById('timerDisplay');
      const modeEl = document.getElementById('timerMode');
      if (!display) return;
      display.textContent = Pomodoro.formatTime(remaining);
      const modeLabels = { focus: 'Enfocado 🧠', break: 'Descanso ☕', paused: 'Pausado ⏸', idle: 'Listo para enfocar' };
      if (modeEl) modeEl.textContent = modeLabels[mode] || '';
    }

    function showModal(focusDurationMin) {
      const modal = document.getElementById('pomModal');
      if (modal) modal.classList.remove('hidden');
      const saveBtn = document.getElementById('pomSaveSession');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const concInput = document.querySelector('input[name="pomConc"]:checked');
          const conc = concInput ? Number(concInput.value) : 3;
          const subject = document.getElementById('pomSubject')?.value || 'Sin materia';
          try {
            const { gamResult } = Sessions.addFromPomodoro(userId, subject, focusDurationMin, conc);
            showXpToast(gamResult.xpEarned, gamResult.newBadges);
            UI.flash('Sesión Pomodoro guardada. +' + gamResult.xpEarned + ' XP', 'success');
          } catch (err) { UI.flash(err.message, 'error'); }
          if (modal) modal.classList.add('hidden');
        });
      }
      const skipBtn = document.getElementById('pomSkipLog');
      if (skipBtn) skipBtn.addEventListener('click', () => { if (modal) modal.classList.add('hidden'); });
    }

    let lastFocusDuration = Pomodoro.DEFAULTS.focus;
    Pomodoro.setCallbacks(
      (remaining, mode) => updateDisplay(remaining, mode),
      (completedMode) => {
        if (completedMode === 'focus') {
          showModal(lastFocusDuration);
        }
        updateDisplay(Pomodoro.getState().remaining, 'idle');
      }
    );

    document.getElementById('pomStart')?.addEventListener('click', () => {
      const focusInput = document.getElementById('focusDur');
      const breakInput = document.getElementById('breakDur');
      Pomodoro.DEFAULTS.focus = Number(focusInput?.value || 25);
      Pomodoro.DEFAULTS.shortBreak = Number(breakInput?.value || 5);
      lastFocusDuration = Pomodoro.DEFAULTS.focus;
      const subject = document.getElementById('pomSubject')?.value || 'Sin materia';
      Pomodoro.reset();
      Pomodoro.start(subject, userId);
    });
    document.getElementById('pomPause')?.addEventListener('click', () => {
      const st = Pomodoro.getState();
      if (st.mode === 'paused') Pomodoro.resume();
      else Pomodoro.pause();
    });
    document.getElementById('pomSkip')?.addEventListener('click', () => Pomodoro.skip());
    document.getElementById('pomReset')?.addEventListener('click', () => { Pomodoro.reset(); updateDisplay(Pomodoro.DEFAULTS.focus * 60, 'idle'); });
  }

  // ---- Pantalla: Perfil de aprendizaje ----
  function screenProfile() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const sessions = Sessions.listFor(user.id);
    const gam = user.gamification || {};
    const levelInfo = Gamification.getLevelInfo(gam.xp || 0);
    const profile = Analytics.classifyProfile(sessions);
    const patterns = Analytics.detectPatterns(sessions);
    const sum = Stats.summary(sessions);

    return `
      <h1>👤 Mi Perfil de Aprendizaje</h1>

      ${profile ? `
      <div class="card" style="text-align:center;padding:30px;">
        <div style="font-size:48px;margin-bottom:12px;">${profile.icon}</div>
        <h2 style="margin:0 0 8px;">${esc(profile.label)}</h2>
        <p class="muted">${esc(profile.desc)}</p>
      </div>` : `<div class="card"><p class="muted">Registra al menos 3 sesiones para ver tu perfil de aprendizaje.</p></div>`}

      <div class="grid cols-3" style="margin-top:18px;">
        <div class="kpi">
          <div class="v" style="font-size:20px;">${esc(levelInfo.current.title)}</div>
          <div class="l">Nivel ${levelInfo.current.level}</div>
        </div>
        <div class="kpi">
          <div class="v">${gam.xp || 0}</div>
          <div class="l">XP total</div>
        </div>
        <div class="kpi">
          <div class="v">🔥 ${gam.streak || 0}</div>
          <div class="l">Días consecutivos</div>
        </div>
        <div class="kpi">
          <div class="v">${sum.total}</div>
          <div class="l">Sesiones totales</div>
        </div>
        <div class="kpi">
          <div class="v">${sum.totalMin}</div>
          <div class="l">Minutos estudiados</div>
        </div>
        <div class="kpi">
          <div class="v">${(gam.badges || []).length}</div>
          <div class="l">Insignias</div>
        </div>
      </div>

      ${patterns ? `
      <div class="card" style="margin-top:18px;">
        <h3>Patrones detectados</h3>
        ${patterns.bestHour !== null ? `<p>⏰ <strong>Mejor hora:</strong> ${patterns.bestHour}:00 — ${patterns.bestHour < 12 ? 'Mañana' : patterns.bestHour < 18 ? 'Tarde' : 'Noche'}</p>` : ''}
        ${patterns.worstSubject ? `<p>📖 <strong>Materia con menor concentración:</strong> ${esc(patterns.worstSubject)} (${patterns.worstSubjectAvg.toFixed(1)}/5)</p>` : ''}
        ${patterns.optimalDuration ? `<p>⏱️ <strong>Duración óptima:</strong> Sesiones ${patterns.optimalDuration}</p>` : ''}
      </div>` : ''}

      <div class="card" style="margin-top:18px;">
        <h3>Mis insignias obtenidas</h3>
        <div class="badges-grid">
          ${Gamification.BADGES.filter(b => (gam.badges || []).includes(b.id)).map(b => `
            <div class="badge-card">
              <span class="badge-icon">${b.icon}</span>
              <div class="badge-name">${esc(b.label)}</div>
            </div>`).join('') || '<p class="muted">Aún no tienes insignias. ¡Empieza a estudiar!</p>'}
        </div>
      </div>

      ${user.classroomId ? `
      <div class="card" style="margin-top:18px;">
        <h3>Cambio de aula</h3>
        <p class="muted" style="font-size:13px;">¿Necesitas cambiarte de aula? Envía una solicitud a tu docente.</p>
        <form id="changeClassroomForm" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:12px;">
          <div class="field" style="flex:1;min-width:200px;margin-bottom:0;">
            <label>Código de invitación del aula destino</label>
            <input name="targetCode" placeholder="Ej. ABCD1234" maxlength="8" style="text-transform:uppercase;" required />
          </div>
          <button class="ghost" type="submit" style="flex-shrink:0;">Solicitar cambio</button>
        </form>
      </div>` : ''}

      ${user.schoolId && !user.classroomId ? `
      <div class="card" style="margin-top:18px;">
        <h3>Unirse a un aula</h3>
        <p class="muted" style="font-size:13px;">Ingresa el código de invitación de tu aula.</p>
        <form id="joinClassroomForm" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:12px;">
          <div class="field" style="flex:1;min-width:200px;margin-bottom:0;">
            <label>Código de invitación</label>
            <input name="inviteCode" placeholder="Ej. ABCD1234" maxlength="8" style="text-transform:uppercase;" required />
          </div>
          <button class="ghost" type="submit" style="flex-shrink:0;">Enviar solicitud</button>
        </form>
      </div>` : ''}`;
  }

  function wireProfile() {
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

  return {
    screens: {
      'pending-approval': { render: screenPendingApproval, wire: wirePendingApproval },
      institution:  { render: screenInstitution,  wire: wireInstitution },
      dashboard:    { render: screenDashboard,    wire: wireDashboard },
      'new-session':{ render: screenNewSession,   wire: wireNewSession },
      subjects:     { render: screenSubjects,     wire: wireSubjects },
      history:      { render: () => screenHistory(App._historyFilters || {}), wire: wireHistory },
      stats:        { render: screenStats,        wire: wireStats },
      recommend:    { render: screenRecommend,    wire: () => {} },
      achievements: { render: screenAchievements, wire: () => {} },
      leaderboard:  { render: screenLeaderboard,  wire: wireLeaderboard },
      pomodoro:     { render: screenPomodoro,     wire: wirePomodoro },
      profile:      { render: screenProfile,      wire: wireProfile }
    }
  };
})();
