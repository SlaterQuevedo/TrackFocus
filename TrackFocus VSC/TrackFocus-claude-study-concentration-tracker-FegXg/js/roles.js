// Constantes de roles y guards de acceso.
const Roles = (() => {
  const SUPER_ADMIN = 'super_admin';
  const TEACHER     = 'teacher';
  const STUDENT     = 'student';

  function current() {
    const s = Storage.get();
    if (!s.currentUserId) return null;

    const user = s.users[s.currentUserId];
    if (!user) return null;

    // NEW: Si es super_admin, validar que está en whitelist
    if (user.role === 'super_admin') {
      const SUPER_ADMIN_EMAILS = Auth.getSuperAdminEmails?.();
      const userEmail = (user.email || user.id || '').toLowerCase();
      if (!SUPER_ADMIN_EMAILS || !SUPER_ADMIN_EMAILS.includes(userEmail)) {
        // Seguridad: alguien manipuló sessionStorage o la BD
        console.error('[Roles] Unauthorized super_admin attempt. Email:', userEmail, 'Whitelist:', SUPER_ADMIN_EMAILS);
        // Fire-and-forget logout (no bloquear)
        Auth.logout?.().catch(e => console.warn('[Roles] logout error:', e));
        App.go?.('welcome');
        throw new Error('Unauthorized admin access');
      }
    }

    // Si existe activeRole en sesión, usar ese rol + contexto (no el rol primario)
    const activeRole = Auth.getActiveRole?.();
    if (activeRole) {
      return {
        ...user,
        role: activeRole.role,              // Usar rol activo
        schoolId: activeRole.school_id || user.schoolId,
        classroomId: activeRole.classroom_id || user.classroomId
      };
    }

    // Si no hay activeRole, devolver usuario con su rol primario
    return user;
  }

  function is(role) {
    const u = current();
    return u ? u.role === role : false;
  }

  function require(...roles) {
    const u = current();
    if (!u || !roles.includes(u.role)) {
      App.go('welcome');
      throw new Error('Acceso denegado');
    }
    return u;
  }

  return { SUPER_ADMIN, TEACHER, STUDENT, current, is, require };
})();
