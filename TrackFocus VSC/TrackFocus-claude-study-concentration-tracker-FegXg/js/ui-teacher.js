// Pantallas del rol Docente.
const UITeacher = (() => {

  const root = () => document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // --- Helper: panel de solicitudes pendientes ---
  function _pendingRequestsPanel(schoolId, teacherId) {
    const s = Storage.get();
    const requests = Schools.listRequestsForSchool(schoolId).filter(r => r.status === 'pending');
    if (requests.length === 0) return '';
    const classrooms = Schools.listClassrooms(schoolId);

    return `
      <div class="card" style="border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.03);margin-bottom:18px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <span style="font-size:20px;">🔔</span>
          <h2 style="margin:0;">Solicitudes pendientes <span style="background:rgba(245,158,11,0.2);color:var(--warn);border-radius:999px;padding:2px 10px;font-size:13px;">${requests.length}</span></h2>
        </div>
        ${requests.map(req => {
          const targetCr = req.classroomId && s.classrooms[req.classroomId] ? s.classrooms[req.classroomId].name : null;
          const fromCr = req.fromClassroomId && s.classrooms[req.fromClassroomId] ? s.classrooms[req.fromClassroomId].name : null;
          const typeLabel = req.type === 'change'
            ? `Cambio de aula${fromCr ? ': ' + esc(fromCr) + ' →' : ''} ${targetCr ? esc(targetCr) : 'Sin especificar'}`
            : `Solicitud de ingreso${targetCr ? ' · Aula: ' + esc(targetCr) : ''}`;
          return `
            <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                <div>
                  <div style="font-weight:600;font-size:14px;">${esc(req.studentName)}</div>
                  <div class="muted" style="font-size:12px;margin-top:2px;">${esc(req.studentEmail)}</div>
                  <div class="muted" style="font-size:12px;margin-top:2px;">${typeLabel} · ${new Date(req.createdAt).toLocaleDateString('es-PE')}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  ${classrooms.length > 0 ? `
                  <select class="req-cr-sel" data-req="${req.id}" style="padding:7px 30px 7px 10px;font-size:12px;border-radius:8px;">
                    <option value="">— Asignar aula —</option>
                    ${classrooms.map(c => `<option value="${c.id}"${req.classroomId === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
                  </select>` : ''}
                  <button class="primary" data-approve="${req.id}" style="padding:7px 14px;font-size:12px;">✓ Aprobar</button>
                  <button class="danger" data-reject="${req.id}" style="padding:7px 14px;font-size:12px;">✕ Rechazar</button>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  // ---- Pantalla: Dashboard del Docente ----
  function screenTeacherDashboard() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const school = user.schoolId ? s.schools[user.schoolId] : null;
    const classrooms = school ? Schools.listClassrooms(school.id) : [];

    // Calcular KPIs
    let totalStudents = 0;
    let totalSessions = 0;
    let atRiskStudents = 0;
    const classroomCards = classrooms.map(cr => {
      const students = Schools.listStudentsInClassroom(cr.id);
      totalStudents += students.length;

      // Sesiones de esta semana del aula
      const from7 = new Date(); from7.setDate(from7.getDate() - 7);
      const crSessions = Sessions.listForClassroom(cr.id, { from: from7.toISOString() });
      totalSessions += crSessions.length;

      const avgConc = crSessions.length
        ? (crSessions.reduce((a, b) => a + b.concentration, 0) / crSessions.length).toFixed(1)
        : '—';

      // Alumnos en riesgo (últimas 5 sesiones < 2.5)
      let crAtRisk = 0;
      students.forEach(st => {
        const stSessions = s.sessions.filter(se => se.email === st.id).slice(-5);
        if (stSessions.length >= 5) {
          const avg = stSessions.reduce((a, b) => a + b.concentration, 0) / stSessions.length;
          if (avg < 2.5) { crAtRisk++; atRiskStudents++; }
        }
      });

      const lb = Gamification.getLeaderboard('classroom', cr.id, 'week');
      const topStudent = lb[0]?.name || '—';

      return `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <h2 style="margin:0;">${esc(cr.name)}</h2>
            ${crAtRisk > 0 ? `<span class="risk-badge">⚠️ ${crAtRisk} en riesgo</span>` : '<span class="ok-badge">✓ OK</span>'}
          </div>
          <div class="grid cols-3" style="gap:8px;margin-bottom:14px;">
            <div class="kpi" style="padding:10px;"><div class="v" style="font-size:20px;">${students.length}</div><div class="l">Alumnos</div></div>
            <div class="kpi" style="padding:10px;"><div class="v" style="font-size:20px;">${avgConc}</div><div class="l">Conc. sem.</div></div>
            <div class="kpi" style="padding:10px;"><div class="v" style="font-size:20px;">${crSessions.length}</div><div class="l">Ses. sem.</div></div>
          </div>
          <p class="muted" style="font-size:12px;margin:0 0 10px;">Mejor esta semana: <strong>${esc(topStudent)}</strong></p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="primary" data-go="classroom-stats" data-id="${cr.id}">Ver estadísticas</button>
            <button class="ghost" data-go="classroom-manage" data-id="${cr.id}">Gestionar aula</button>
          </div>
        </div>`;
    });

    const pendingCount = school ? Schools.getPendingCount(school.id) : 0;

    return `
      <h1>Panel del Docente</h1>
      ${school ? `<p class="muted">Colegio: <strong>${esc(school.name)}</strong> · Código de colegio: <strong>${school.code}</strong></p>` : '<p class="muted">No estás asignado a ningún colegio.</p>'}

      ${school ? _pendingRequestsPanel(school.id, user.id) : ''}

      <div class="grid cols-3" style="margin:16px 0;">
        <div class="kpi"><div class="v">${totalStudents}</div><div class="l">Total alumnos</div></div>
        <div class="kpi"><div class="v">${totalSessions}</div><div class="l">Sesiones esta semana</div></div>
        <div class="kpi"><div class="v" style="color:${atRiskStudents > 0 ? 'var(--bad)' : 'var(--good)'};">${atRiskStudents}</div><div class="l">Alumnos en riesgo</div></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h2 style="margin:0;">Mis Aulas</h2>
        <button class="primary" data-go="classroom-manage" data-id="new">+ Nueva aula</button>
      </div>

      ${classroomCards.length > 0
        ? `<div class="grid cols-2">${classroomCards.join('')}</div>`
        : '<div class="card empty">No tienes aulas creadas. Crea tu primera aula para empezar.</div>'}`;
  }

  function _wireApprovalButtons(teacherId) {
    root().querySelectorAll('[data-approve]').forEach(btn => {
      btn.addEventListener('click', () => {
        const reqId = btn.dataset.approve;
        const sel = root().querySelector(`.req-cr-sel[data-req="${reqId}"]`);
        const targetCr = sel ? sel.value || null : null;
        Schools.approveRequest(reqId, teacherId, targetCr);
        UI.flash('Solicitud aprobada. El alumno ya puede acceder al sistema.', 'success');
        App.go('teacher-dashboard');
      });
    });
    root().querySelectorAll('[data-reject]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('¿Rechazar esta solicitud?')) return;
        Schools.rejectRequest(btn.dataset.reject, teacherId);
        UI.flash('Solicitud rechazada.', 'success');
        App.go('teacher-dashboard');
      });
    });
  }

  function wireTeacherDashboard() {
    const user = Storage.get().users[Storage.get().currentUserId];
    root().querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => {
        const go = btn.dataset.go;
        const id = btn.dataset.id;
        if (id) App._classroomId = id;
        App.go(go);
      });
    });
    _wireApprovalButtons(user.id);
  }

  // ---- Pantalla: Gestión de Aula ----
  function screenClassroomManage() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    const classroomId = App._classroomId;
    const school = user.schoolId ? s.schools[user.schoolId] : null;
    const isNew = classroomId === 'new';

    let rosterHtml = '';
    let crName = 'Nueva Aula';
    let inviteCodeHtml = '';

    if (!isNew && classroomId) {
      const cr = s.classrooms[classroomId];
      crName = cr ? cr.name : 'Aula';

      // Invite code card
      if (cr) {
        inviteCodeHtml = `
          <div class="card" style="border-color:rgba(200,155,109,0.3);margin-bottom:18px;">
            <h3>Código de invitación del aula</h3>
            <p class="muted" style="font-size:13px;">Comparte este código con tus alumnos para que puedan solicitar unirse a esta aula.</p>
            <div style="display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap;">
              <code style="font-size:22px;font-weight:800;letter-spacing:3px;color:var(--primary);background:rgba(200,155,109,0.1);border:1px solid rgba(200,155,109,0.3);padding:10px 20px;border-radius:10px;">${cr.inviteCode || '—'}</code>
              <button class="ghost" id="regenCodeBtn" data-cr="${classroomId}">↻ Regenerar</button>
            </div>
          </div>`;
      }

      const students = Schools.listStudentsInClassroom(classroomId);

      rosterHtml = `
        <div class="card" style="padding:0;overflow:auto;margin-top:18px;">
          <div style="padding:16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;">Alumnos — ${esc(crName)}</h3>
            <span class="muted">${students.length} alumnos</span>
          </div>
          ${students.length === 0 ? '<div class="empty">Aún no hay alumnos en esta aula. Los estudiantes se unen con el código del colegio.</div>' : `
          <table class="table">
            <thead><tr>
              <th>Nombre</th><th>Nivel</th><th>XP</th><th>Racha</th><th>Conc. prom. (7d)</th><th>Última sesión</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>
              ${students.map(st => {
                const gam = st.gamification || {};
                const stSessions = s.sessions.filter(se => se.email === st.id);
                const from7 = new Date(); from7.setDate(from7.getDate() - 7);
                const recent = stSessions.filter(se => new Date(se.datetime) >= from7);
                const avgRecent = recent.length
                  ? (recent.reduce((a, b) => a + b.concentration, 0) / recent.length).toFixed(1)
                  : '—';
                const lastSession = stSessions.sort((a, b) => b.datetime.localeCompare(a.datetime))[0];
                const last5 = stSessions.slice(-5);
                const avg5 = last5.length >= 5 ? last5.reduce((a, b) => a + b.concentration, 0) / last5.length : null;
                const isAtRisk = avg5 !== null && avg5 < 2.5;

                return `<tr>
                  <td>${esc(st.name)}</td>
                  <td><span class="chip">Nv.${gam.level || 1}</span></td>
                  <td>${gam.xp || 0}</td>
                  <td>🔥 ${gam.streak || 0}</td>
                  <td>${avgRecent}</td>
                  <td>${lastSession ? new Date(lastSession.datetime).toLocaleDateString('es-PE') : '—'}</td>
                  <td>${isAtRisk ? '<span class="risk-badge">En riesgo</span>' : '<span class="ok-badge">OK</span>'}</td>
                  <td>
                    <button class="ghost" data-go="student-detail" data-sid="${esc(st.id)}">Ver</button>
                    <button class="danger" data-remove="${esc(st.id)}">Quitar</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>`;
    }

    // Lista de aulas del colegio para mostrar selector de mover
    const allClassrooms = school ? Schools.listClassrooms(school.id) : [];

    const schoolId = school ? school.id : null;
    const pendingForCr = schoolId ? Schools.listRequestsForSchool(schoolId)
      .filter(r => r.status === 'pending' && (r.classroomId === classroomId || (!r.classroomId && !isNew))) : [];

    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <button class="ghost" data-go="teacher-dashboard">← Volver</button>
        <h1 style="margin:0;">${isNew ? 'Nueva Aula' : 'Gestionar: ' + esc(crName)}</h1>
      </div>

      ${inviteCodeHtml}

      ${!isNew && pendingForCr.length > 0 && school ? _pendingRequestsPanel(school.id, user.id) : ''}

      <div class="card">
        <h3>Crear nueva aula</h3>
        <form id="createClassroomForm" class="row">
          <div class="field">
            <label>Grado</label>
            <select name="grade">
              <option>1ro</option><option>2do</option><option>3ro</option><option>4to</option><option>5to</option>
            </select>
          </div>
          <div class="field">
            <label>Sección</label>
            <input name="section" placeholder="A, B, C…" maxlength="5" required />
          </div>
          <div class="field" style="justify-content:flex-end;">
            <label style="opacity:0;">.</label>
            <button class="primary" type="submit">Crear aula</button>
          </div>
        </form>
      </div>

      ${!isNew && allClassrooms.length > 1 ? `
      <div class="card">
        <h3>Mover alumno a otra aula</h3>
        <div class="row">
          <div class="field">
            <label>ID del alumno (email)</label>
            <input id="moveStudentId" placeholder="email@gmail.com" />
          </div>
          <div class="field">
            <label>Destino</label>
            <select id="moveTargetCr">
              ${allClassrooms.filter(c => c.id !== classroomId).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="justify-content:flex-end;">
            <label style="opacity:0;">.</label>
            <button class="primary" id="moveStudentBtn">Mover</button>
          </div>
        </div>
      </div>` : ''}

      ${rosterHtml}`;
  }

  function wireClassroomManage() {
    const s = Storage.get();
    const user = s.users[s.currentUserId];
    root().querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sid;
        if (id) App._studentDetailId = id;
        App.go(btn.dataset.go);
      });
    });

    document.getElementById('createClassroomForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!user.schoolId) return UI.flash('No estás asignado a un colegio.', 'error');
      try {
        const cr = Schools.createClassroom(user.schoolId, fd.get('grade'), fd.get('section'));
        // Vincular docente al aula
        Storage.set(st => {
          if (!st.classrooms[cr.id].teacherIds.includes(user.id)) st.classrooms[cr.id].teacherIds.push(user.id);
          if (!st.users[user.id].classroomIds) st.users[user.id].classroomIds = [];
          if (!st.users[user.id].classroomIds.includes(cr.id)) st.users[user.id].classroomIds.push(cr.id);
        });
        App._classroomId = cr.id;
        App.go('classroom-manage');
        UI.flash(`Aula "${cr.name}" creada correctamente.`, 'success');
      } catch (err) { UI.flash(err.message, 'error'); }
    });

    root().querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const classroomId = App._classroomId;
        if (!confirm('¿Quitar este alumno del aula?')) return;
        Schools.removeStudentFromClassroom(btn.dataset.remove, classroomId);
        App.go('classroom-manage');
      });
    });

    document.getElementById('moveStudentBtn')?.addEventListener('click', () => {
      const studentId = document.getElementById('moveStudentId')?.value.trim();
      const targetCr = document.getElementById('moveTargetCr')?.value;
      if (!studentId || !targetCr) return UI.flash('Completa los campos.', 'error');
      Schools.moveStudent(studentId, targetCr);
      UI.flash('Alumno movido correctamente.', 'success');
      App.go('classroom-manage');
    });

    document.getElementById('regenCodeBtn')?.addEventListener('click', () => {
      const crId = document.getElementById('regenCodeBtn').dataset.cr;
      const newCode = Schools.regenerateInviteCode(crId);
      UI.flash(`Nuevo código generado: ${newCode}`, 'success');
      App.go('classroom-manage');
    });

    _wireApprovalButtons(user.id);
  }

  // ---- Pantalla: Estadísticas del Aula ----
  function screenClassroomStats() {
    const classroomId = App._classroomId;
    const s = Storage.get();
    const cr = s.classrooms[classroomId];
    if (!cr) return '<div class="card empty">Aula no encontrada.</div>';

    const students = Schools.listStudentsInClassroom(classroomId);
    const allCrSessions = Sessions.listForClassroom(classroomId);

    // KPIs
    const avgConc = allCrSessions.length
      ? (allCrSessions.reduce((a, b) => a + b.concentration, 0) / allCrSessions.length).toFixed(1)
      : '—';
    const totalMin = allCrSessions.reduce((a, b) => a + b.durationMin, 0);

    // Semanas (8 últimas)
    const weekLabels = [];
    const weekAvgs = [];
    for (let w = 7; w >= 0; w--) {
      const to = new Date(); to.setDate(to.getDate() - w * 7);
      const from = new Date(to); from.setDate(to.getDate() - 7);
      const wSessions = allCrSessions.filter(se => {
        const d = new Date(se.datetime);
        return d >= from && d < to;
      });
      weekLabels.push(`Sem. -${w}`);
      weekAvgs.push(wSessions.length ? parseFloat((wSessions.reduce((a, b) => a + b.concentration, 0) / wSessions.length).toFixed(2)) : null);
    }

    // Promedio por materia
    const bySub = {};
    allCrSessions.forEach(se => {
      if (!bySub[se.subject]) bySub[se.subject] = { sum: 0, count: 0 };
      bySub[se.subject].sum += se.concentration;
      bySub[se.subject].count++;
    });
    const subLabels = Object.keys(bySub);
    const subAvgs = subLabels.map(k => parseFloat((bySub[k].sum / bySub[k].count).toFixed(2)));

    // Ranking del aula
    const lb = Gamification.getLeaderboard('classroom', classroomId, 'all').slice(0, 10);

    // Alumnos en riesgo
    const atRisk = students.filter(st => {
      const last5 = s.sessions.filter(se => se.email === st.id).slice(-5);
      if (last5.length < 5) return false;
      return last5.reduce((a, b) => a + b.concentration, 0) / last5.length < 2.5;
    });

    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <button class="ghost" data-go="teacher-dashboard">← Volver</button>
        <h1 style="margin:0;">Aula: ${esc(cr.name)}</h1>
      </div>

      <div class="grid cols-4" style="margin-bottom:18px;">
        <div class="kpi"><div class="v">${students.length}</div><div class="l">Alumnos</div></div>
        <div class="kpi"><div class="v">${avgConc}</div><div class="l">Conc. prom. total</div></div>
        <div class="kpi"><div class="v">${allCrSessions.length}</div><div class="l">Sesiones totales</div></div>
        <div class="kpi"><div class="v">${totalMin}</div><div class="l">Minutos estudiados</div></div>
      </div>

      <div class="grid cols-2" style="margin-bottom:18px;">
        <div class="card">
          <h3>Concentración semanal (últimas 8 semanas)</h3>
          <div class="chart-container">
            <canvas id="chartWeekly"></canvas>
          </div>
        </div>
        <div class="card">
          <h3>Concentración por materia</h3>
          <div class="chart-container">
            <canvas id="chartSubject"></canvas>
          </div>
        </div>
      </div>

      ${atRisk.length > 0 ? `
      <div class="card" style="border-color:var(--bad);margin-bottom:18px;">
        <h3 style="color:var(--bad);">⚠️ Alumnos en riesgo (${atRisk.length})</h3>
        <p class="muted">Concentración promedio menor a 2.5 en sus últimas 5 sesiones.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${atRisk.map(st => `<span class="chip" style="border-color:var(--bad);cursor:pointer;" data-go="student-detail" data-sid="${esc(st.id)}">${esc(st.name)}</span>`).join('')}
        </div>
      </div>` : `<div class="alert success" style="margin-bottom:18px;">✓ Ningún alumno en situación de riesgo esta semana.</div>`}

      <div class="card" style="padding:0;overflow:auto;">
        <div style="padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;">Ranking del aula</h3>
        </div>
        ${lb.length === 0 ? '<div class="empty">Sin datos todavía.</div>' : `
        <table class="leaderboard-table">
          <thead><tr>
            <th style="padding:10px 14px;">#</th>
            <th style="padding:10px 8px;">Estudiante</th>
            <th style="padding:10px 8px;">XP</th>
            <th style="padding:10px 8px;">Racha</th>
            <th style="padding:10px 8px;">Sesiones</th>
            <th style="padding:10px 8px;">Conc. prom.</th>
            <th style="padding:10px 8px;"></th>
          </tr></thead>
          <tbody>
            ${lb.map(e => `<tr>
              <td style="padding:10px 14px;" class="rank-medal-${e.rank}">${e.rank <= 3 ? ['🥇','🥈','🥉'][e.rank-1] : e.rank}</td>
              <td style="padding:10px 8px;">${esc(e.name)}</td>
              <td style="padding:10px 8px;"><strong>${e.xp}</strong></td>
              <td style="padding:10px 8px;">🔥 ${e.streak}</td>
              <td style="padding:10px 8px;">${e.sessionCount}</td>
              <td style="padding:10px 8px;">${e.avgConcentration}/5</td>
              <td style="padding:10px 8px;"><button class="ghost" data-go="student-detail" data-sid="${e.userId}">Ver</button></td>
            </tr>`).join('')}
          </tbody>
        </table>`}
      </div>`;
  }

  function wireClassroomStats() {
    root().querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sid;
        if (id) App._studentDetailId = id;
        App.go(btn.dataset.go);
      });
    });

    const classroomId = App._classroomId;
    const allCrSessions = Sessions.listForClassroom(classroomId);

    // Gráfica semanal
    const weekLabels = [];
    const weekAvgs = [];
    for (let w = 7; w >= 0; w--) {
      const to = new Date(); to.setDate(to.getDate() - w * 7);
      const from = new Date(to); from.setDate(to.getDate() - 7);
      const wSessions = allCrSessions.filter(se => {
        const d = new Date(se.datetime);
        return d >= from && d < to;
      });
      weekLabels.push(`Sem. -${w}`);
      weekAvgs.push(wSessions.length ? parseFloat((wSessions.reduce((a, b) => a + b.concentration, 0) / wSessions.length).toFixed(2)) : null);
    }

    Charts.create('chartWeekly', Charts.lineConfig(
      weekLabels,
      [{ label: 'Concentración promedio', data: weekAvgs }]
    ));

    // Gráfica por materia
    const bySub = {};
    allCrSessions.forEach(se => {
      if (!bySub[se.subject]) bySub[se.subject] = { sum: 0, count: 0 };
      bySub[se.subject].sum += se.concentration;
      bySub[se.subject].count++;
    });
    const subLabels = Object.keys(bySub);
    const subAvgs = subLabels.map(k => parseFloat((bySub[k].sum / bySub[k].count).toFixed(2)));
    if (subLabels.length > 0) {
      Charts.create('chartSubject', Charts.barConfig(subLabels, subAvgs, 'Conc. prom.', Charts.COLORS.primary));
    }
  }

  // ---- Pantalla: Detalle del Estudiante ----
  function screenStudentDetail() {
    const studentId = App._studentDetailId;
    const s = Storage.get();
    const student = s.users[studentId];
    if (!student) return '<div class="card empty">Estudiante no encontrado.</div>';

    const sessions = Sessions.listFor(studentId);
    const gam = student.gamification || {};
    const levelInfo = Gamification.getLevelInfo(gam.xp || 0);
    const sum = Stats.summary(sessions);
    const profile = Analytics.classifyProfile(sessions);
    const alerts = Analytics.generateAlerts(studentId);
    const subs = Stats.bySubject(sessions);

    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <button class="ghost" data-go="classroom-manage">← Volver</button>
        <h1 style="margin:0;">👤 ${esc(student.name)}</h1>
      </div>

      ${alerts.map(a => `<div class="alert ${a.type === 'success' ? 'success' : a.type === 'error' ? 'error' : 'info'}">${a.msg}</div>`).join('')}

      <div class="grid cols-4" style="margin-bottom:18px;">
        <div class="kpi"><div class="v">${sum.total}</div><div class="l">Sesiones</div></div>
        <div class="kpi"><div class="v">${sum.avgConc || '—'}</div><div class="l">Conc. prom.</div></div>
        <div class="kpi"><div class="v">${sum.totalMin}</div><div class="l">Min. totales</div></div>
        <div class="kpi"><div class="v">🔥 ${gam.streak || 0}</div><div class="l">Racha</div></div>
      </div>

      <div class="grid cols-2" style="margin-bottom:18px;">
        <div class="card">
          <h3>Gamificación</h3>
          <p><strong>Nivel:</strong> ${levelInfo.current.level} — ${esc(levelInfo.current.title)}</p>
          <p><strong>XP Total:</strong> ${gam.xp || 0}</p>
          <p><strong>Insignias:</strong> ${(gam.badges || []).length} / ${Gamification.BADGES.length}</p>
          <div class="xp-bar-wrap" style="margin-top:8px;">
            <div class="xp-bar" style="width:${levelInfo.progress}%"></div>
          </div>
        </div>
        ${profile ? `
        <div class="card" style="text-align:center;">
          <div style="font-size:36px;">${profile.icon}</div>
          <h3 style="margin:8px 0 4px;">${esc(profile.label)}</h3>
          <p class="muted" style="font-size:12px;">${esc(profile.desc)}</p>
        </div>` : '<div class="card"><p class="muted">Pocas sesiones para determinar perfil.</p></div>'}
      </div>

      <div class="card">
        <h3>Concentración por materia</h3>
        ${subs.map(r => {
          const pct = (r.avgConcentration / 5) * 100;
          return `<div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span>${esc(r.subject)}</span>
              <span class="muted">${r.avgConcentration}/5 · ${r.count} ses.</span>
            </div>
            <div class="bar"><span style="width:${pct}%"></span></div>
          </div>`;
        }).join('') || '<p class="muted">Sin datos.</p>'}
      </div>

      <div class="card" style="padding:0;overflow:auto;">
        <div style="padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;">Últimas 10 sesiones</h3>
        </div>
        <table class="table">
          <thead><tr><th>Fecha</th><th>Materia</th><th>Conc.</th><th>Min</th><th>Actividad previa</th></tr></thead>
          <tbody>
            ${sessions.slice(0, 10).map(x => `
              <tr>
                <td>${new Date(x.datetime).toLocaleString('es-PE')}</td>
                <td>${esc(x.subject)}</td>
                <td><strong>${x.concentration}</strong>/5</td>
                <td>${x.durationMin}</td>
                <td>${esc(x.previousActivity)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function wireStudentDetail() {
    root().querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => App.go(btn.dataset.go));
    });
  }

  return {
    screens: {
      'teacher-dashboard': { render: screenTeacherDashboard, wire: wireTeacherDashboard },
      'classroom-manage':  { render: screenClassroomManage,  wire: wireClassroomManage },
      'classroom-stats':   { render: screenClassroomStats,   wire: wireClassroomStats },
      'student-detail':    { render: screenStudentDetail,    wire: wireStudentDetail }
    }
  };
})();
