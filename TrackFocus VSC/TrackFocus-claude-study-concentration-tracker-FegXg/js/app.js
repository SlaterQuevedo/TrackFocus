// Router role-aware + bootstrap.
const App = (() => {

  const ROUTE_ROLES = {
    // Públicas
    'welcome':            null,
    'role-selector':      null,
    'student-onboarding': null,
    'teacher-promote':    null,
    'admin-promote':      null,

    // Estudiante
    'pending-approval':   ['student'],
    'institution':        ['student'],
    'dashboard':          ['student'],
    'new-session':        ['student'],
    'pomodoro':           ['student'],
    'subjects':           ['student'],
    'history':            ['student'],
    'stats':              ['student'],
    'recommend':          ['student'],
    'achievements':       ['student'],
    'leaderboard':        ['student'],
    'profile':            ['student'],
    'ai-study':           ['student'],

    // Docente
    'teacher-dashboard':  ['teacher'],
    'classroom-manage':   ['teacher'],
    'classroom-stats':    ['teacher'],
    'student-detail':     ['teacher', 'super_admin'],

    // Super Admin
    'admin-dashboard':    ['super_admin'],
    'manage-schools':     ['super_admin'],
    'manage-users':       ['super_admin'],
  };

  let _current = null;

  function go(route, params = {}) {
    Charts.destroyAll();

    const user = Roles.current();
    const allowed = ROUTE_ROLES[route];

    if (allowed === undefined) {
      document.getElementById('app').innerHTML = `<div class="alert error">Pantalla desconocida: ${route}</div>`;
      return;
    }

    if (allowed !== null && (!user || !allowed.includes(user.role))) {
      if (!user) return go('welcome');
      if (user.role === 'super_admin') return go('admin-dashboard');
      if (user.role === 'teacher')     return go('teacher-dashboard');
      return go('dashboard');
    }

    _current = route;

    document.getElementById('app').className = route === 'welcome' ? 'lp-main' : 'container';

    const allScreens = {
      welcome:              { render: screenWelcome,           wire: wireWelcome },
      'role-selector':      { render: screenRoleSelector,      wire: wireRoleSelector },
      'student-onboarding': { render: screenStudentOnboarding, wire: wireStudentOnboarding },
      'teacher-promote':    { render: screenTeacherPromote,    wire: wireTeacherPromote },
      'admin-promote':      { render: screenAdminPromote,      wire: wireAdminPromote },
      ...UIStudent.screens,
      ...UITeacher.screens,
      ...UIAdmin.screens
    };

    const screen = allScreens[route];
    if (!screen) {
      document.getElementById('app').innerHTML = `<div class="alert error">Pantalla no implementada: ${route}</div>`;
      return;
    }

    document.getElementById('app').innerHTML = screen.render(params);
    screen.wire(params);
    updateChrome();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function updateChrome() {
    const user = Roles.current();
    const nav = document.getElementById('topnav');
    const userbox = document.getElementById('userbox');
    const topbar = document.querySelector('.topbar');
    const footer = document.querySelector('.footer');

    if (_current === 'welcome') {
      if (topbar) topbar.style.display = 'none';
      if (footer) footer.style.display = 'none';
      nav.classList.add('hidden');
      userbox.classList.add('hidden');
      return;
    }

    if (topbar) topbar.style.display = '';
    if (footer) footer.style.display = '';

    if (!user) {
      nav.classList.add('hidden');
      userbox.classList.add('hidden');
      return;
    }

    nav.classList.remove('hidden');
    userbox.classList.remove('hidden');

    const s = Storage.get();
    let navButtons = '';

    if (user.role === 'student') {
      navButtons = `
        <button data-route="dashboard">Panel</button>
        <button data-route="ai-study">Estudio IA</button>
        <button data-route="stats">Estadísticas</button>
        <button data-route="leaderboard">Ranking</button>
        <button data-route="profile">Perfil</button>`;
    } else if (user.role === 'teacher') {
      navButtons = `
        <button data-route="teacher-dashboard">Mi Panel</button>
        <button data-route="classroom-manage">Aulas</button>
        <button data-route="classroom-stats">Estadísticas</button>`;
    } else if (user.role === 'super_admin') {
      navButtons = `
        <button data-route="admin-dashboard">Panel Global</button>
        <button data-route="manage-schools">Colegios</button>
        <button data-route="manage-users">Usuarios</button>`;
    }

    nav.innerHTML = navButtons;
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.route === _current));

    const schoolName = user.schoolId && s.schools[user.schoolId] ? ` · ${s.schools[user.schoolId].name}` : '';
    document.getElementById('userLabel').textContent = `${user.name}${schoolName}`;
  }

  function bindGlobal() {
    document.getElementById('topnav').addEventListener('click', (e) => {
      const r = e.target.closest('button')?.dataset.route;
      if (r) go(r);
    });
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await Auth.logout();
      go('welcome');
    });
  }

  function wirePomodoroBar() {
    const bar     = document.getElementById('pomBar');
    const display = document.getElementById('pomBarDisplay');
    const modeEl  = document.getElementById('pomBarMode');
    if (!bar) return;

    const modeLabels = { focus: 'ENFOCADO 🧠', break: 'DESCANSO ☕', paused: 'PAUSADO ⏸', idle: 'LISTO' };

    // Rellenar materias cuando haya usuario activo
    function _refreshSubjects() {
      const s    = Storage.get();
      const user = s.users[s.currentUserId];
      if (!user) return;
      const subs = Subjects.listSubjects(user.institutionType || 'colegio', user.id);
      const sel  = document.getElementById('pomBarSubject');
      if (sel && !sel.options.length) {
        sel.innerHTML = subs.map(x => `<option>${x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</option>`).join('');
      }
    }

    // Restaurar estado del timer
    const pState = Pomodoro.getState();
    if (display) display.textContent = Pomodoro.formatTime(pState.remaining || Pomodoro.DEFAULTS.focus * 60);
    if (modeEl)  modeEl.textContent  = modeLabels[pState.mode] || 'LISTO';
    if (pState.mode !== 'idle') bar.classList.remove('hidden');

    // Modal de ciclo completado (global)
    function _showGlobalPomModal(focusDurationMin) {
      // Reutilizar modal si existe en el DOM actual, o crear uno temporal
      let modal = document.getElementById('pomModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pomModal';
        modal.className = 'pom-modal';
        modal.innerHTML = `<div class="pom-modal-inner card">
          <h2>🍅 ¡Ciclo completado!</h2>
          <p>¿Qué nivel de concentración tuviste?</p>
          <div class="likert" id="pomLikert">
            ${[1,2,3,4,5].map(v => `<label><input type="radio" name="pomConc" value="${v}" ${v===3?'checked':''}/><div class="lk-num">${v}</div></label>`).join('')}
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
            <button class="ghost" id="pomSkipLog">Saltar</button>
            <button class="primary" id="pomSaveSession">Guardar</button>
          </div>
        </div>`;
        document.body.appendChild(modal);
      }
      modal.classList.remove('hidden');
      modal.style.display = '';

      document.getElementById('pomSaveSession')?.addEventListener('click', () => {
        const s       = Storage.get();
        const userId  = s.currentUserId;
        const conc    = Number(document.querySelector('input[name="pomConc"]:checked')?.value || 3);
        const subject = document.getElementById('pomBarSubject')?.value || 'Sin materia';
        try {
          const { gamResult } = Sessions.addFromPomodoro(userId, subject, focusDurationMin, conc);
          UI.flash?.('Sesión Pomodoro guardada. +' + gamResult.xpEarned + ' XP', 'success');
        } catch(e) { UI.flash?.(e.message, 'error'); }
        modal.classList.add('hidden');
      }, { once: true });

      document.getElementById('pomSkipLog')?.addEventListener('click', () => {
        modal.classList.add('hidden');
      }, { once: true });
    }

    let lastFocus = Pomodoro.DEFAULTS.focus;

    Pomodoro.setCallbacks(
      (remaining, mode) => {
        if (display) display.textContent = Pomodoro.formatTime(remaining);
        if (modeEl)  modeEl.textContent  = modeLabels[mode] || '';
        bar.classList.remove('hidden');
        document.body.classList.add('pom-active');
      },
      (completedMode) => {
        if (completedMode === 'focus') _showGlobalPomModal(lastFocus);
        if (display) display.textContent = Pomodoro.formatTime(Pomodoro.DEFAULTS.focus * 60);
        if (modeEl)  modeEl.textContent  = 'LISTO';
      }
    );

    document.getElementById('pomBarStart')?.addEventListener('click', () => {
      _refreshSubjects();
      const f = Number(document.getElementById('pomBarFocus')?.value || 25);
      const b = Number(document.getElementById('pomBarBreak')?.value || 5);
      Pomodoro.DEFAULTS.focus      = f;
      Pomodoro.DEFAULTS.shortBreak = b;
      lastFocus = f;
      const subj = document.getElementById('pomBarSubject')?.value || 'Sin materia';
      Pomodoro.reset();
      Pomodoro.start(subj, Storage.get().currentUserId);
      bar.classList.remove('hidden');
      document.body.classList.add('pom-active');
    });

    document.getElementById('pomBarPause')?.addEventListener('click', () => {
      const st = Pomodoro.getState();
      if (st.mode === 'paused') Pomodoro.resume(); else Pomodoro.pause();
    });

    document.getElementById('pomBarSkip')?.addEventListener('click', () => Pomodoro.skip());

    document.getElementById('pomBarReset')?.addEventListener('click', () => {
      Pomodoro.reset();
      if (display) display.textContent = Pomodoro.formatTime(Pomodoro.DEFAULTS.focus * 60);
      if (modeEl)  modeEl.textContent  = 'LISTO';
    });

    document.getElementById('pomBarToggle')?.addEventListener('click', () => {
      bar.classList.toggle('hidden');
      if (bar.classList.contains('hidden')) {
        document.body.classList.remove('pom-active');
      } else {
        document.body.classList.add('pom-active');
      }
    });

    // Exponer función para que screenAIStudy pueda mostrar la barra al entrar
    window._showPomBar = () => {
      _refreshSubjects();
      bar.classList.remove('hidden');
      document.body.classList.add('pom-active');
    };
  }

  async function start() {
    bindGlobal();
    wirePomodoroBar();

    if (!window.SB_READY) {
      go('welcome');
      // Mostrar aviso amable si supabase-config.js no está configurado
      setTimeout(() => UI.flash?.('Configura supabase-config.js para activar la nube.', 'error'), 200);
      return;
    }

    // 1. ¿Hay sesión Google activa?
    const authSession = await Auth.getSession();
    if (!authSession) return go('welcome');
    console.log('[App] Auth session:', { email: authSession.user?.email, isSuperAdmin: authSession.isSuperAdmin, roles: authSession.availableRoles?.map(r => r.role) });

    // 2. Verificar roles disponibles y multi-rol.
    // NEW: Si es super_admin oficial, auto-seleccionar su rol admin (skip selector)
    if (authSession.isSuperAdmin) {
      const adminRole = authSession.availableRoles?.find(r => r.role === 'super_admin')
        || { role: 'super_admin', email: authSession.user?.email, user_id: authSession.user?.email };
      if (!Auth.getActiveRole()) {
        Auth.setActiveRole(adminRole);
      }
    }

    // Si tiene múltiples roles y no hay uno activo seleccionado: mostrar selector
    if (authSession.hasMultipleRoles && !Auth.getActiveRole()) {
      sessionStorage.setItem('_AVAILABLE_ROLES', JSON.stringify(authSession.availableRoles));
      return go('role-selector');
    }

    // Si tiene un solo rol: auto-seleccionar
    if (!Auth.getActiveRole()) {
      if (authSession.availableRoles?.length === 1) {
        Auth.setActiveRole(authSession.availableRoles[0]);
      }
    }

    const activeRole = Auth.getActiveRole();
    if (!activeRole) {
      console.error('[App] No active role set');
      return go('welcome');
    }

    console.log('[App] Active role:', activeRole.role);

    // 3. Cargar/crear datos del usuario
    try {
      await Users.syncFromSupabase(authSession.user.id);
    } catch (err) {
      console.error('[App] Error syncing user:', err);
      UI.flash('Error sincronizando datos. Intenta recargar.', 'error');
      return go('welcome');
    }

    // 4. Navegar según rol
    if (activeRole.role === 'student') {
      return go('dashboard');
    } else if (activeRole.role === 'teacher') {
      return go('teacher-dashboard');
    } else if (activeRole.role === 'super_admin') {
      return go('admin-dashboard');
    }

    console.error('[App] Unknown role:', activeRole.role);
    go('welcome');
  }

  return { go, start };
})();
