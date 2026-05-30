// Storage cloud-backed con cache en memoria.
// API pública IDÉNTICA a la versión anterior (get / set / uuid / DEFAULT_STATE)
// para que sessions.js, schools.js, gamification.js, subjects.js, ui-*.js
// sigan funcionando sin cambios. El sync hacia Supabase ocurre transparentemente
// después de cada mutación (fire-and-forget, errores logueados).
const Storage = (() => {

  const DEFAULT_STATE = {
    schemaVersion: 2,
    currentUserId: null,

    users: {},
    schools: {},
    classrooms: {},
    sessions: [],
    uploadedFiles: {},
    availableRoles: [],  // NEW: roles disponibles para el usuario actual
    subjectsByInstitution: {
      colegio: ['Matemática', 'Comunicación', 'Física', 'Química', 'Inglés', 'Historia']
    },
    customSubjects: {},
    students: {},
    classroomRequests: {}
  };

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // Snapshot profundo del estado para diffing posterior.
  function snapshot(s) { return JSON.parse(JSON.stringify(s)); }

  // Estado interno
  let state = structuredClone(DEFAULT_STATE);
  let booted = false;
  let pendingSync = Promise.resolve();

  // ----- Bootstrap: traer todo desde la nube tras autenticarse -----
  async function bootstrap() {
    if (!window.SB) {
      console.warn('[Storage] Supabase no configurado — modo desconectado (sólo lectura cache).');
      booted = false;
      return state;
    }
    state = await Cloud.bootstrap();

    // NEW: Cargar availableRoles para el usuario actual
    const activeRole = Auth.getActiveRole?.();
    if (activeRole?.email) {
      try {
        const rolesRes = await window.SB
          .from('user_roles')
          .select('*')
          .eq('email', activeRole.email);
        state.availableRoles = rolesRes.data || [];
      } catch (err) {
        console.warn('[Storage] Error loading available roles:', err);
        state.availableRoles = [];
      }
    }

    booted = true;
    return state;
  }

  // Carga el currentUserId desde la sesión auth de Supabase (si existe)
  function setCurrent(userId) {
    state.currentUserId = userId;
  }

  function clear() {
    state = structuredClone(DEFAULT_STATE);
    booted = false;
  }

  // ----- API pública -----

  function get() { return state; }

  // set(mutator): muta el estado y, si estamos booteados con cloud,
  // dispara un sync por diff hacia Supabase. NO bloquea — devuelve inmediato.
  // Para esperar a que termine el último sync, llama a Storage.flush().
  function set(mutator) {
    if (!booted || !window.SB) {
      // Modo desconectado: sólo cache.
      mutator(state);
      return;
    }
    const before = snapshot(state);
    mutator(state);
    const after = snapshot(state);
    pendingSync = pendingSync
      .then(() => Cloud.syncDiff(before, after))
      .catch(e => console.error('[Storage] cloud sync error:', e));
  }

  async function flush() {
    try { await pendingSync; } catch (_) {}
  }

  // ----- Realtime: cuando otro dispositivo modifica datos, re-bootstrap el cache -----

  let _realtimeBound = false;
  function bindRealtime(onAfterRefresh) {
    if (_realtimeBound || !window.SB) return;
    _realtimeBound = true;
    let _refreshTimer = null;
    Cloud.subscribeRealtime(() => {
      // Debounce: si llegan varios cambios en ráfaga, hacemos un solo refresh
      clearTimeout(_refreshTimer);
      _refreshTimer = setTimeout(async () => {
        try {
          const currentUserId = state.currentUserId;
          state = await Cloud.bootstrap();
          state.currentUserId = currentUserId;
          if (typeof onAfterRefresh === 'function') onAfterRefresh();
        } catch (e) {
          console.error('[Storage] realtime refresh error:', e);
        }
      }, 400);
    });
  }

  return {
    get,
    set,
    bootstrap,
    setCurrent,
    clear,
    flush,
    bindRealtime,
    uuid,
    DEFAULT_STATE,
    isBooted: () => booted
  };
})();
