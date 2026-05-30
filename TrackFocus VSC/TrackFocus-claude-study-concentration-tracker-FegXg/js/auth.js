// Autenticación con Google OAuth (Supabase).
// El email es el identificador estable del usuario. El trigger SQL crea
// el perfil en public.users automáticamente al primer login.
const Auth = (() => {

  const ADMIN_PASSWORD = 'Sl@terQvz#1';

  // Official super admin emails (email-gated access)
  const SUPER_ADMIN_EMAILS = [
    'trackfocus.owner@gmail.com',
    'trackfocus.support@gmail.com'
  ];

  // Clave en sessionStorage para recordar la intención de rol durante el redirect OAuth.
  const ROLE_INTENT_KEY = 'tf.roleIntent';

  // ----- Google OAuth -----

  // Inicia el flujo de Google OAuth.  Después del redirect, supabase-js
  // detecta la sesión en la URL y dispara onAuthStateChange.
  async function signInWithGoogle(roleIntent) {
    if (!window.SB) throw new Error('Supabase no está configurado. Revisa supabase-config.js');
    if (roleIntent) sessionStorage.setItem(ROLE_INTENT_KEY, roleIntent);
    const { error } = await window.SB.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;
  }

  function getRoleIntent() {
    const v = sessionStorage.getItem(ROLE_INTENT_KEY);
    sessionStorage.removeItem(ROLE_INTENT_KEY);
    return v;
  }

  // Obtiene la sesión actual (post-redirect o de visitas anteriores).
  // Ahora también retorna availableRoles + hasMultipleRoles.
  async function getSession() {
    if (!window.SB) return null;
    const { data: { session } } = await window.SB.auth.getSession();
    if (!session) return null;

    const user = await fetchProfile(session.user.email.toLowerCase());
    if (!user) return { session };

    // Consultar user_roles para este usuario
    const rolesRes = await window.SB
      .from('user_roles')
      .select('*')
      .eq('email', session.user.email.toLowerCase());

    const availableRoles = rolesRes.data || [];
    const hasMultipleRoles = availableRoles.length > 1;
    const userEmail = (user.email || session.user.email).toLowerCase();
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(userEmail);

    return {
      session,
      user,
      availableRoles,
      hasMultipleRoles,
      isSuperAdmin
    };
  }

  // Recupera el perfil de public.users (creado por el trigger SQL).
  async function fetchProfile(email) {
    if (!window.SB) return null;
    const { data, error } = await window.SB.from('users').select('*').eq('id', email).maybeSingle();
    if (error) { console.error('[Auth] fetchProfile error:', error); return null; }
    return data ? Cloud.fromDb.user(data) : null;
  }

  // ----- Aplicar códigos (colegio/aula) post-login -----

  // Asigna colegio/aula a un estudiante recién logueado o existente sin asignación.
  async function applyStudentCodes(email, schoolCode, inviteCode) {
    const s = Storage.get();
    let schoolId = null;
    let classroomId = null;

    if (schoolCode && schoolCode.trim()) {
      const code = schoolCode.trim().toUpperCase();
      const school = Object.values(s.schools).find(sc => sc.code === code);
      if (!school) throw new Error('Código de colegio inválido. Verifica con tu docente.');
      schoolId = school.id;
    }

    if (inviteCode && inviteCode.trim() && schoolId) {
      const cr = Schools.findClassroomByCode(inviteCode);
      if (cr && cr.schoolId === schoolId) {
        classroomId = cr.id;
      } else if (cr) {
        throw new Error('El código de aula no pertenece al colegio indicado.');
      }
    }

    if (schoolId) {
      const user = s.users[email];
      if (!user) throw new Error('Perfil no encontrado.');
      if (user.schoolId && user.schoolId !== schoolId) {
        // Cambio de colegio: requiere solicitud de transferencia (no cambiamos directo)
        throw new Error('Ya perteneces a otro colegio. Pide a tu profesor que apruebe la transferencia.');
      }
      Storage.set(st => {
        st.users[email].schoolId = schoolId;
        st.users[email].institutionType = 'colegio';
        st.users[email].approvalStatus = 'pending';
      });
      Schools.createJoinRequest(email, schoolId, classroomId);
    }

    return Storage.get().users[email];
  }

  // ----- Docente: promoción de rol con código de colegio -----

  async function promoteToTeacher(email, schoolCode) {
    const s = Storage.get();
    const code = schoolCode.trim().toUpperCase();
    const school = Object.values(s.schools).find(sc => sc.code === code);
    if (!school) throw new Error('Código de colegio inválido.');

    Storage.set(st => {
      const u = st.users[email];
      if (!u) return;
      u.role = 'teacher';
      u.schoolId = school.id;
      if (!Array.isArray(u.classroomIds)) u.classroomIds = [];
      if (!st.schools[school.id].adminIds.includes(email)) {
        st.schools[school.id].adminIds.push(email);
      }
    });

    // Insertar en user_roles table (NEW)
    if (window.SB) {
      try {
        await window.SB.from('user_roles').insert({
          user_id: email,
          email: email,
          role: 'teacher',
          school_id: school.id
        });
      } catch (err) {
        console.warn('[Auth] Failed to insert teacher role:', err);
        // No lanzar error — continuamos de todas formas
      }
    }

    return Storage.get().users[email];
  }

  // ----- Super Admin: contraseña para promover al usuario actual -----

  async function promoteToSuperAdmin(email, password) {
    throw new Error(
      'Admin promotion is disabled. ' +
      'Only official administrator emails can access admin dashboard.'
    );
  }

  // ----- Active Role Management (session-based multi-role) -----

  // Guardar el rol activo en sessionStorage
  // roleEntry = { id, user_id, email, role, school_id, classroom_id, created_at }
  function setActiveRole(roleEntry) {
    if (!roleEntry) {
      sessionStorage.removeItem('ACTIVE_ROLE');
      return;
    }
    sessionStorage.setItem('ACTIVE_ROLE', JSON.stringify(roleEntry));
  }

  // Recuperar el rol activo desde sessionStorage
  function getActiveRole() {
    const stored = sessionStorage.getItem('ACTIVE_ROLE');
    return stored ? JSON.parse(stored) : null;
  }

  // ----- Logout -----

  async function logout() {
    if (window.SB) {
      try { await window.SB.auth.signOut(); } catch (e) { console.warn('[Auth] signOut error:', e); }
    }
    Cloud.unsubscribeRealtime?.();
    Storage.clear();
    sessionStorage.removeItem('ACTIVE_ROLE');
  }

  // ----- Helper: Return super admin email list for validation -----

  function getSuperAdminEmails() {
    return SUPER_ADMIN_EMAILS;
  }

  function generateSchoolCode() {
    return Storage.uuid().toUpperCase().replace(/-/g, '').slice(0, 6);
  }

  // ----- API legacy (compatibilidad con código existente) -----
  // Estas firmas existían en la versión vieja.  Las mantenemos para no romper
  // ningún caller, pero ahora delegan al flujo Google + códigos.

  function loginOrRegisterStudent() {
    throw new Error('Este flujo ahora usa Google. Llama a Auth.signInWithGoogle("student").');
  }
  function loginTeacher() {
    throw new Error('Este flujo ahora usa Google. Llama a Auth.signInWithGoogle("teacher").');
  }
  function loginSuperAdmin() {
    throw new Error('Este flujo ahora usa Google. Llama a Auth.signInWithGoogle("admin").');
  }

  return {
    signInWithGoogle,
    getSession,
    fetchProfile,
    getRoleIntent,
    applyStudentCodes,
    promoteToTeacher,
    promoteToSuperAdmin,
    logout,
    generateSchoolCode,
    setActiveRole,
    getActiveRole,
    getSuperAdminEmails,
    // legacy:
    loginOrRegisterStudent, loginTeacher, loginSuperAdmin
  };
})();
