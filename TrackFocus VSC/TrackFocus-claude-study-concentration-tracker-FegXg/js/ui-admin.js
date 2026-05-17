// Pantallas del Super Admin.
const UIAdmin = (() => {

  const root = () => document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // ---- Pantalla: Dashboard del Super Admin ----
  function screenAdminDashboard() {
    const s = Storage.get();
    const schools = Schools.listSchools();
    const allStudents = Object.values(s.users).filter(u => u.role === 'student');
    const allTeachers = Object.values(s.users).filter(u => u.role === 'teacher');
    const allSessions = s.sessions;

    const from7 = new Date(); from7.setDate(from7.getDate() - 7);
    const sessionsThisWeek = allSessions.filter(se => new Date(se.datetime) >= from7);
    const avgConc = allSessions.length
      ? (allSessions.reduce((a, b) => a + b.concentration, 0) / allSessions.length).toFixed(1)
      : '—';

    const schoolCards = schools.map(sc => {
      const stats = Schools.getSchoolStats(sc.id);
      return `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <h2 style="margin:0;">${esc(sc.name)}</h2>
            <span class="chip" style="font-family:monospace;font-size:11px;">${sc.code}</span>
          </div>
          <div class="grid cols-4" style="gap:8px;margin-bottom:14px;">
            <div class="kpi" style="padding:8px;"><div class="v" style="font-size:18px;">${stats.studentCount}</div><div class="l">Alumnos</div></div>
            <div class="kpi" style="padding:8px;"><div class="v" style="font-size:18px;">${stats.classroomCount}</div><div class="l">Aulas</div></div>
            <div class="kpi" style="padding:8px;"><div class="v" style="font-size:18px;">${stats.sessionCount}</div><div class="l">Sesiones</div></div>
            <div class="kpi" style="padding:8px;"><div class="v" style="font-size:18px;">${stats.avgConcentration}</div><div class="l">Conc. prom.</div></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="ghost" data-go="manage-schools" data-sid="${esc(sc.id)}">Editar</button>
            <button class="danger" data-del-school="${esc(sc.id)}" data-name="${esc(sc.name)}">Eliminar</button>
          </div>
        </div>`;
    });

    return `
      <h1>⚙️ Panel de Control — Super Admin</h1>

      <div class="grid cols-4" style="margin-bottom:24px;">
        <div class="kpi"><div class="v">${schools.length}</div><div class="l">Colegios</div></div>
        <div class="kpi"><div class="v">${allStudents.length}</div><div class="l">Estudiantes</div></div>
        <div class="kpi"><div class="v">${allTeachers.length}</div><div class="l">Docentes</div></div>
        <div class="kpi"><div class="v">${allSessions.length}</div><div class="l">Sesiones totales</div></div>
      </div>

      <div class="grid cols-3" style="margin-bottom:24px;">
        <div class="kpi"><div class="v">${sessionsThisWeek.length}</div><div class="l">Sesiones esta semana</div></div>
        <div class="kpi"><div class="v">${avgConc}</div><div class="l">Concentración prom. global</div></div>
        <div class="kpi"><div class="v">${allSessions.reduce((a, b) => a + b.durationMin, 0)}</div><div class="l">Minutos totales</div></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h2 style="margin:0;">Colegios registrados</h2>
        <div style="display:flex;gap:8px;">
          <button class="primary" data-go="manage-schools">+ Crear colegio</button>
          <button class="ghost" data-go="manage-users">Gestionar usuarios</button>
        </div>
      </div>

      ${schoolCards.length > 0
        ? `<div class="grid cols-2">${schoolCards.join('')}</div>`
        : '<div class="card empty">No hay colegios registrados. Crea el primero.</div>'}`;
  }

  function wireAdminDashboard() {
    root().querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sid;
        if (sid) App._editSchoolId = sid;
        App.go(btn.dataset.go);
      });
    });
    root().querySelectorAll('[data-del-school]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.delSchool;
        const name = btn.dataset.name;
        if (!confirm(`¿Eliminar el colegio "${name}" y todos sus datos? Esta acción no se puede deshacer.`)) return;
        Schools.deleteSchool(id);
        App.go('admin-dashboard');
        UI.flash('Colegio eliminado.', 'success');
      });
    });
  }

  // ---- Pantalla: Gestión de Colegios ----
  function screenManageSchools() {
    const s = Storage.get();
    const schools = Schools.listSchools();
    const editId = App._editSchoolId;
    const editSchool = editId ? s.schools[editId] : null;

    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <button class="ghost" data-go="admin-dashboard">← Volver</button>
        <h1 style="margin:0;">Gestión de Colegios</h1>
      </div>

      <div class="card">
        <h3>${editSchool ? 'Editar colegio' : 'Crear nuevo colegio'}</h3>
        <form id="schoolForm" class="row" style="align-items:flex-end;">
          <div class="field" style="flex:2;">
            <label>Nombre del colegio</label>
            <input name="name" placeholder="Ej. Colegio Trilce, I.E. San Martín…" value="${editSchool ? esc(editSchool.name) : ''}" required />
          </div>
          <div class="field">
            <label style="opacity:0;">.</label>
            <button class="primary" type="submit">${editSchool ? 'Actualizar' : 'Crear colegio'}</button>
            ${editSchool ? '<button type="button" class="ghost" data-go="manage-schools" id="cancelEdit">Cancelar</button>' : ''}
          </div>
        </form>
      </div>

      <div class="card" style="padding:0;overflow:auto;">
        <div style="padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;">Todos los colegios</h3>
        </div>
        ${schools.length === 0 ? '<div class="empty">No hay colegios creados.</div>' : `
        <table class="table">
          <thead><tr>
            <th>Colegio</th><th>Código</th><th>Alumnos</th><th>Aulas</th><th>Sesiones</th><th>Creado</th><th></th>
          </tr></thead>
          <tbody>
            ${schools.map(sc => {
              const stats = Schools.getSchoolStats(sc.id);
              return `<tr>
                <td><strong>${esc(sc.name)}</strong></td>
                <td><span class="chip" style="font-family:monospace;">${sc.code}</span></td>
                <td>${stats.studentCount}</td>
                <td>${stats.classroomCount}</td>
                <td>${stats.sessionCount}</td>
                <td>${new Date(sc.createdAt).toLocaleDateString('es-PE')}</td>
                <td>
                  <button class="ghost" data-edit="${esc(sc.id)}">Editar</button>
                  <button class="danger" data-del="${esc(sc.id)}" data-name="${esc(sc.name)}">Eliminar</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>`;
  }

  function wireManageSchools() {
    root().querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.id === 'cancelEdit') App._editSchoolId = null;
        App.go(btn.dataset.go);
      });
    });

    document.getElementById('schoolForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = new FormData(e.target).get('name').trim();
      if (!name) return;
      const editId = App._editSchoolId;
      if (editId) {
        Schools.updateSchool(editId, name);
        App._editSchoolId = null;
        UI.flash('Colegio actualizado.', 'success');
      } else {
        const sc = Schools.createSchool(name);
        UI.flash(`Colegio "${sc.name}" creado. Código: ${sc.code}`, 'success');
      }
      App.go('manage-schools');
    });

    root().querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => { App._editSchoolId = btn.dataset.edit; App.go('manage-schools'); });
    });

    root().querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(`¿Eliminar "${btn.dataset.name}"? Esta acción es irreversible.`)) return;
        Schools.deleteSchool(btn.dataset.del);
        App.go('manage-schools');
        UI.flash('Colegio eliminado.', 'success');
      });
    });
  }

  // ---- Pantalla: Gestión de Usuarios ----
  function screenManageUsers() {
    const s = Storage.get();
    const filterRole = App._userFilterRole || '';
    const filterSchool = App._userFilterSchool || '';

    let users = Object.values(s.users).filter(u => u.id !== 'superadmin');
    if (filterRole) users = users.filter(u => u.role === filterRole);
    if (filterSchool) users = users.filter(u => u.schoolId === filterSchool);
    users.sort((a, b) => a.name.localeCompare(b.name));

    const schools = Schools.listSchools();
    const ROLE_LABELS = { student: 'Estudiante', teacher: 'Docente', super_admin: 'Super Admin' };

    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <button class="ghost" data-go="admin-dashboard">← Volver</button>
        <h1 style="margin:0;">Gestión de Usuarios</h1>
      </div>

      <div class="toolbar" style="margin-bottom:16px;">
        <div class="filters">
          <select id="filterRole">
            <option value="">Todos los roles</option>
            <option value="student" ${filterRole === 'student' ? 'selected' : ''}>Estudiantes</option>
            <option value="teacher" ${filterRole === 'teacher' ? 'selected' : ''}>Docentes</option>
          </select>
          <select id="filterSchool">
            <option value="">Todos los colegios</option>
            ${schools.map(sc => `<option value="${sc.id}" ${filterSchool === sc.id ? 'selected' : ''}>${esc(sc.name)}</option>`).join('')}
          </select>
          <button class="ghost" id="applyFilter">Aplicar filtros</button>
        </div>
        <span class="muted">${users.length} usuario${users.length === 1 ? '' : 's'}</span>
      </div>

      <div class="card" style="padding:0;overflow:auto;">
        ${users.length === 0 ? '<div class="empty">No hay usuarios con esos filtros.</div>' : `
        <table class="table">
          <thead><tr>
            <th>Nombre</th><th>Email</th><th>Rol</th><th>Colegio</th><th>Aula</th><th>Estado</th><th>Registrado</th><th></th>
          </tr></thead>
          <tbody>
            ${users.map(u => {
              const school = u.schoolId ? s.schools[u.schoolId]?.name : '—';
              const classroom = u.classroomId ? s.classrooms[u.classroomId]?.name : '—';
              let statusBadge = '';
              if (u.role === 'student') {
                if (u.approvalStatus === 'pending')  statusBadge = '<span class="pending-badge">Pendiente</span>';
                else if (u.approvalStatus === 'rejected') statusBadge = '<span class="rejected-badge">Rechazada</span>';
                else if (u.approvalStatus === 'approved' || u.classroomId) statusBadge = '<span class="approved-badge">Activo</span>';
              }
              return `<tr>
                <td><strong>${esc(u.name)}</strong></td>
                <td class="muted">${esc(u.email)}</td>
                <td><span class="chip">${ROLE_LABELS[u.role] || u.role}</span></td>
                <td>${esc(school || '—')}</td>
                <td>${esc(classroom || '—')}</td>
                <td>${statusBadge || '—'}</td>
                <td>${new Date(u.createdAt).toLocaleDateString('es-PE')}</td>
                <td><button class="danger" data-del-user="${esc(u.id)}">Eliminar</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>`;
  }

  function wireManageUsers() {
    root().querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => App.go(btn.dataset.go)));

    document.getElementById('applyFilter')?.addEventListener('click', () => {
      App._userFilterRole = document.getElementById('filterRole')?.value || '';
      App._userFilterSchool = document.getElementById('filterSchool')?.value || '';
      App.go('manage-users');
    });

    root().querySelectorAll('[data-del-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.delUser;
        const s = Storage.get();
        const user = s.users[id];
        if (!user) return;
        if (!confirm(`¿Eliminar al usuario "${user.name}"?`)) return;
        Storage.set(st => { delete st.users[id]; });
        App.go('manage-users');
        UI.flash('Usuario eliminado.', 'success');
      });
    });
  }

  return {
    screens: {
      'admin-dashboard': { render: screenAdminDashboard, wire: wireAdminDashboard },
      'manage-schools':  { render: screenManageSchools,  wire: wireManageSchools },
      'manage-users':    { render: screenManageUsers,    wire: wireManageUsers }
    }
  };
})();
