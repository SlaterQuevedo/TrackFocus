// Router role-aware + bootstrap.
const App = (() => {

  const ROUTE_ROLES = {
    // Públicas
    'welcome':            null,
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
        <button data-route="new-session">Registrar</button>
        <button data-route="pomodoro">🍅 Pomodoro</button>
        <button data-route="leaderboard">🏆 Ranking</button>
        <button data-route="stats">Estadísticas</button>
        <button data-route="achievements">Logros</button>
        <button data-route="recommend">Tips</button>
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

  async function start() {
    bindGlobal();

    if (!window.SB_READY) {
      go('welcome');
      // Mostrar aviso amable si supabase-config.js no está configurado
      setTimeout(() => UI.flash?.('Configura supabase-config.js para activar la nube.', 'error'), 200);
      return;
    }

    // 1. ¿Hay sesión Google activa?
    const session = await Auth.getSession();
    if (!session) return go('welcome');

    // 2. Sí: trae todo el estado desde Supabase y monta cache local
    try {
      await Storage.bootstrap();
    } catch (e) {
      console.error('[App] bootstrap error:', e);
      UI.flash?.('No se pudieron cargar tus datos. Reintenta.', 'error');
      return go('welcome');
    }

    Storage.setCurrent(session.user.email.toLowerCase());

    // Suscribirse a cambios remotos (multi-dispositivo)
    Storage.bindRealtime(() => {
      // Cuando llegan cambios, repintar la pantalla actual
      if (_current && _current !== 'welcome') go(_current);
    });

    const user = Roles.current();
    if (!user) return go('welcome');

    // 3. ¿Hay intención de rol pendiente del click pre-OAuth?
    const intent = Auth.getRoleIntent();

    // Si es admin pendiente, mostrar pantalla de contraseña
    if (intent === 'admin' && user.role !== 'super_admin') return go('admin-promote');
    if (intent === 'teacher' && user.role === 'student' && !user.schoolId) return go('teacher-promote');

    // 4. Rutado por rol
    if (user.role === 'super_admin') return go('admin-dashboard');
    if (user.role === 'teacher')     return go('teacher-dashboard');
    if (user.schoolId && (user.approvalStatus === 'pending' || user.approvalStatus === 'rejected')) {
      return go('pending-approval');
    }
    if (!user.institutionType && !user.schoolId) return go('student-onboarding');
    if (!user.institutionType) return go('institution');
    return go('dashboard');
  }

  // ---- Pantalla de bienvenida premium (3 roles) ----
  function screenWelcome() {
    const svgStudent = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    const svgTeacher = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
    const svgAdmin   = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const svgArrow   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

    return `
    <div class="lp">
      <div class="lp-glow lp-glow-1"></div>
      <div class="lp-glow lp-glow-2"></div>
      <div class="lp-glow lp-glow-3"></div>

      <header class="lp-header">
        <div class="lp-brand">
          <img src="assets/logo.svg" class="lp-brand-img" alt="TrackFocus">
          <span>TrackFocus</span>
        </div>
        <button class="lp-header-btn" id="lpScrollCards">Iniciar sesión</button>
      </header>

      <div class="lp-hero">
        <div class="lp-pill">
          <span class="lp-pill-dot"></span>
          Plataforma Educativa Inteligente
        </div>
        <h1 class="lp-title">Concentración que<br>transforma tu aprendizaje</h1>
        <p class="lp-subtitle">Gamificación, analytics en tiempo real y Pomodoro para colegios e instituciones educativas.</p>

        <div class="lp-stats">
          <div class="lp-stat">
            <span class="lp-stat-n">3</span>
            <span class="lp-stat-l">Roles de acceso</span>
          </div>
          <div class="lp-stat-sep"></div>
          <div class="lp-stat">
            <span class="lp-stat-n">20</span>
            <span class="lp-stat-l">Niveles de progresión</span>
          </div>
          <div class="lp-stat-sep"></div>
          <div class="lp-stat">
            <span class="lp-stat-n">11</span>
            <span class="lp-stat-l">Logros desbloqueables</span>
          </div>
        </div>

        <div class="lp-cards">
          <div class="lp-card lp-card--gold" data-role="student">
            <div class="lp-icon-ring">${svgStudent}</div>
            <h3>Soy Estudiante</h3>
            <p>Registra sesiones, gana XP, sube de nivel y compite en el ranking de tu aula.</p>
            <div class="lp-card-foot">
              <span style="font-size:12px;color:#52525B;">Gratis · Solo Gmail</span>
              <button class="lp-arrow-btn" tabindex="-1">${svgArrow}</button>
            </div>
          </div>

          <div class="lp-card lp-card--purple" data-role="teacher">
            <div class="lp-icon-ring">${svgTeacher}</div>
            <h3>Soy Docente</h3>
            <p>Gestiona tu aula, monitorea el progreso y detecta alumnos en riesgo con analytics.</p>
            <div class="lp-card-foot">
              <span style="font-size:12px;color:#52525B;">Requiere código</span>
              <button class="lp-arrow-btn" tabindex="-1">${svgArrow}</button>
            </div>
          </div>

          <div class="lp-card lp-card--blue" data-role="admin">
            <div class="lp-icon-ring">${svgAdmin}</div>
            <h3>Administrador</h3>
            <p>Control total de la plataforma, gestión de colegios y usuarios del sistema.</p>
            <div class="lp-card-foot">
              <span style="font-size:12px;color:#52525B;">Acceso restringido</span>
              <button class="lp-arrow-btn" tabindex="-1">${svgArrow}</button>
            </div>
          </div>
        </div>

        <div id="authForm" class="lp-form-wrap hidden"></div>

        <div class="lp-features">
          <div class="lp-feat">
            <div class="lp-feat-icon lp-feat-icon--gold">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <h4>Gamificación</h4>
            <p>XP, niveles, badges y ranking por aula para mantener la motivación alta.</p>
          </div>
          <div class="lp-feat">
            <div class="lp-feat-icon lp-feat-icon--purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <h4>Analytics</h4>
            <p>Detección automática de patrones y alertas de rendimiento en tiempo real.</p>
          </div>
          <div class="lp-feat">
            <div class="lp-feat-icon lp-feat-icon--blue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h4>Pomodoro</h4>
            <p>Timer con ciclos automáticos y análisis post-sesión de productividad.</p>
          </div>
        </div>

        <footer class="lp-footer">
          <span>© 2025 TrackFocus</span>
          <span class="lp-footer-sep">·</span>
          <span>Datos sincronizados de forma segura en la nube</span>
        </footer>
      </div>
    </div>`;
  }

  function wireWelcome() {
    root().querySelectorAll('.lp-card[data-role]').forEach(card => {
      card.addEventListener('click', () => {
        root().querySelectorAll('.lp-card[data-role]').forEach(c => c.classList.remove('lp-selected'));
        card.classList.add('lp-selected');
        renderAuthForm(card.dataset.role);
        setTimeout(() => {
          const form = document.getElementById('authForm');
          if (form) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 60);
      });
    });

    const scrollBtn = document.getElementById('lpScrollCards');
    if (scrollBtn) {
      scrollBtn.addEventListener('click', () => {
        root().querySelector('.lp-cards')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  function root() { return document.getElementById('app'); }

  const _svgIco = {
    user: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 10-16 0"/></svg>`,
    mail: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>`,
    lock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    arrow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`
  };

  function _lpField(label, inputHTML, optLabel) {
    const opt = optLabel ? ` <span class="lp-opt">${optLabel}</span>` : '';
    return `<div class="lp-field"><label>${label}${opt}</label>${inputHTML}</div>`;
  }

  function _lpInput(ico, attrs) {
    return `<div class="lp-input-row"><span class="lp-input-ico">${_svgIco[ico]}</span><input ${attrs} /></div>`;
  }

  // Logo oficial de Google (Material) para el botón de login
  const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>`;

  function renderAuthForm(role) {
    const container = document.getElementById('authForm');
    if (!container) return;

    container.classList.remove('hidden', 'lp-form--purple', 'lp-form--blue');

    const cfg = {
      student: { cls: 'lp-form-emoji--gold',   emoji: '🎒', title: 'Entrar como Estudiante', subtitle: 'Inicia sesión con tu cuenta de Google. Crearemos tu perfil al instante.' },
      teacher: { cls: 'lp-form-emoji--purple', emoji: '👩‍🏫', title: 'Entrar como Docente',    subtitle: 'Inicia sesión con tu cuenta institucional de Google.' },
      admin:   { cls: 'lp-form-emoji--blue',   emoji: '🛡️', title: 'Acceso Administrador',     subtitle: 'Inicia sesión con Google y luego ingresa la contraseña de administrador.' }
    }[role];

    if (role === 'teacher') container.classList.add('lp-form--purple');
    if (role === 'admin')   container.classList.add('lp-form--blue');

    container.innerHTML = `
      <div class="lp-form-head">
        <div class="lp-form-emoji ${cfg.cls}">${cfg.emoji}</div>
        <div class="lp-form-head-text">
          <h2>${cfg.title}</h2>
          <p>${cfg.subtitle}</p>
        </div>
      </div>
      <button class="lp-btn-google" type="button" id="googleSignInBtn">
        ${GOOGLE_SVG}
        <span>Continuar con Google</span>
      </button>
      <p class="lp-form-foot">Al continuar aceptas que tus datos se sincronicen de forma segura en la nube.</p>
    `;

    document.getElementById('googleSignInBtn').addEventListener('click', async () => {
      try {
        await Auth.signInWithGoogle(role);
      } catch (err) {
        UI.flash(err.message || 'No se pudo iniciar Google. Revisa la configuración.', 'error');
      }
    });
  }

  // ---- Onboarding post-Google para estudiantes (códigos de colegio/aula) ----
  function screenStudentOnboarding() {
    const u = Roles.current();
    if (!u) { return ''; }
    return `
      <div class="card" style="max-width:520px;margin:48px auto;">
        <h2 style="margin:0 0 8px;">¡Bienvenido${u.name ? ', ' + u.name.split(' ')[0] : ''}!</h2>
        <p class="muted" style="margin:0 0 22px;">Para unirte a tu colegio, ingresa los códigos que te dio tu profesor. Puedes saltarlo y agregarlos después.</p>
        <form id="onboardForm">
          <label>Código del colegio <span class="muted">(opcional)</span></label>
          <input name="code" maxlength="6" placeholder="6 caracteres" style="text-transform:uppercase;" />
          <label style="margin-top:14px;">Código del aula <span class="muted">(opcional)</span></label>
          <input name="inviteCode" maxlength="8" placeholder="8 caracteres" style="text-transform:uppercase;" />
          <div style="display:flex;gap:10px;margin-top:18px;">
            <button class="primary" type="submit">Continuar</button>
            <button class="ghost" type="button" id="skipOnboard">Saltar por ahora</button>
          </div>
        </form>
      </div>`;
  }
  function wireStudentOnboarding() {
    document.getElementById('onboardForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const u = Roles.current();
        await Auth.applyStudentCodes(u.id, fd.get('code'), fd.get('inviteCode'));
        await Storage.flush();
        const fresh = Roles.current();
        if (fresh.schoolId && fresh.approvalStatus === 'pending') return go('pending-approval');
        return go('institution');
      } catch (err) { UI.flash(err.message, 'error'); }
    });
    document.getElementById('skipOnboard')?.addEventListener('click', () => go('institution'));
  }

  // ---- Pantalla para promover a docente (post-Google) ----
  function screenTeacherPromote() {
    return `
      <div class="card" style="max-width:520px;margin:48px auto;">
        <h2 style="margin:0 0 8px;">Verificación de docente</h2>
        <p class="muted" style="margin:0 0 22px;">Ingresa el código del colegio que te dio el administrador.</p>
        <form id="teacherPromoteForm">
          <label>Código del colegio</label>
          <input name="code" maxlength="6" required placeholder="6 caracteres" style="text-transform:uppercase;" />
          <div style="display:flex;gap:10px;margin-top:18px;">
            <button class="primary" type="submit">Continuar</button>
            <button class="ghost" type="button" id="cancelTeacherPromote">Cancelar</button>
          </div>
        </form>
      </div>`;
  }
  function wireTeacherPromote() {
    document.getElementById('teacherPromoteForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const u = Roles.current();
        await Auth.promoteToTeacher(u.id, fd.get('code'));
        await Storage.flush();
        go('teacher-dashboard');
      } catch (err) { UI.flash(err.message, 'error'); }
    });
    document.getElementById('cancelTeacherPromote')?.addEventListener('click', async () => {
      await Auth.logout();
      go('welcome');
    });
  }

  // ---- Pantalla para promover a super admin ----
  function screenAdminPromote() {
    return `
      <div class="card" style="max-width:520px;margin:48px auto;">
        <h2 style="margin:0 0 8px;">Acceso de administrador</h2>
        <p class="muted" style="margin:0 0 22px;">Ingresa la contraseña maestra para acceder al panel global.</p>
        <form id="adminPromoteForm">
          <label>Contraseña</label>
          <input name="password" type="password" required placeholder="Contraseña secreta" />
          <div style="display:flex;gap:10px;margin-top:18px;">
            <button class="primary" type="submit">Entrar al panel</button>
            <button class="ghost" type="button" id="cancelAdminPromote">Cancelar</button>
          </div>
        </form>
      </div>`;
  }
  function wireAdminPromote() {
    document.getElementById('adminPromoteForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const u = Roles.current();
        await Auth.promoteToSuperAdmin(u.id, fd.get('password'));
        await Storage.flush();
        go('admin-dashboard');
      } catch (err) { UI.flash(err.message, 'error'); }
    });
    document.getElementById('cancelAdminPromote')?.addEventListener('click', async () => {
      await Auth.logout();
      go('welcome');
    });
  }

  return {
    go,
    start,
    _historyFilters: {},
    _lbScope: 'classroom',
    _lbPeriod: 'week',
    _classroomId: null,
    _studentDetailId: null,
    _editSchoolId: null,
    _userFilterRole: '',
    _userFilterSchool: ''
  };
})();

window.addEventListener('DOMContentLoaded', App.start);
