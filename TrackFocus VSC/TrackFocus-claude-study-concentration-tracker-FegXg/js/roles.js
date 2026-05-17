// Constantes de roles y guards de acceso.
const Roles = (() => {
  const SUPER_ADMIN = 'super_admin';
  const TEACHER     = 'teacher';
  const STUDENT     = 'student';

  function current() {
    const s = Storage.get();
    if (!s.currentUserId) return null;
    return s.users[s.currentUserId] || null;
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
