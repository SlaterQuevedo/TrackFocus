// Capa de persistencia. Una sola clave raíz. Schema v2 con roles, colegios y gamificación.
const Storage = (() => {
  const KEY = 'trackfocus.v1';

  const DEFAULT_STATE = {
    schemaVersion: 2,
    currentUserId: null,

    users: {},
    /*
      users[id] = {
        id, email, name, role: 'super_admin'|'teacher'|'student', createdAt,
        // student-only:
        schoolId, classroomId, institutionType,
        approvalStatus: 'pending'|'approved'|'rejected'|null,
        gamification: { xp, level, streak, lastStudyDate, badges[], challengeProgress{} },
        // teacher-only:
        schoolId, classroomIds[],
      }
    */

    schools: {},
    /*
      schools[id] = { id, name, code, adminIds[], createdAt }
    */

    classrooms: {},
    /*
      classrooms[id] = { id, schoolId, name, grade, section, teacherIds[], studentIds[], createdAt }
    */

    sessions: [],
    subjectsByInstitution: {
      colegio: ['Matemática', 'Comunicación', 'Física', 'Química', 'Inglés', 'Historia']
    },
    customSubjects: {},
    students: {},  // legacy, conservado para migrate()

    classroomRequests: {}
    /*
      classroomRequests[id] = {
        id, studentId, studentName, studentEmail,
        schoolId, classroomId (target|null), grade (null),
        type: 'join' | 'change',
        fromClassroomId: null,
        status: 'pending' | 'approved' | 'rejected',
        createdAt, resolvedAt: null, resolvedBy: null
      }
    */
  };

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function patchLiveData(state) {
    // Patch classrooms that were created before inviteCode was introduced
    Object.values(state.classrooms || {}).forEach(cr => {
      if (!cr.inviteCode) {
        cr.inviteCode = uuid().toUpperCase().replace(/-/g, '').slice(0, 8);
      }
    });
    // Ensure classroomRequests exists
    if (!state.classroomRequests) state.classroomRequests = {};
    // Ensure approvalStatus on existing students
    Object.values(state.users || {}).forEach(u => {
      if (u.role === 'student' && u.approvalStatus === undefined) {
        // Students already assigned to classrooms are considered approved
        u.approvalStatus = u.classroomId ? 'approved' : null;
      }
    });
    return state;
  }

  function migrate(state) {
    if ((state.schemaVersion || 1) >= 2) return patchLiveData(state);

    state.users = state.users || {};
    state.schools = state.schools || {};
    state.classrooms = state.classrooms || {};

    // Convertir students legacy → users
    for (const [email, s] of Object.entries(state.students || {})) {
      if (!state.users[email]) {
        state.users[email] = {
          id: email,
          email,
          name: s.name || email,
          role: 'student',
          createdAt: s.createdAt || new Date().toISOString(),
          schoolId: null,
          classroomId: null,
          institutionType: s.institutionType || null,
          gamification: {
            xp: 0, level: 1, streak: 0,
            lastStudyDate: null,
            badges: [],
            challengeProgress: {}
          }
        };
      }
    }

    // currentEmail → currentUserId
    if (state.currentEmail && !state.currentUserId) {
      state.currentUserId = state.currentEmail;
    }

    // Agregar classroomId a sesiones existentes
    state.sessions = (state.sessions || []).map(s => ({
      ...s,
      classroomId: s.classroomId || null
    }));

    state.schemaVersion = 2;
    return state;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      const merged = { ...structuredClone(DEFAULT_STATE), ...parsed };
      const patched = migrate(merged);
      save(patched); // persist any patches (inviteCode, classroomRequests, approvalStatus)
      return patched;
    } catch (e) {
      console.error('Storage corrupted, resetting:', e);
      return structuredClone(DEFAULT_STATE);
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  let state = load();

  return {
    get: () => state,
    set: (mutator) => {
      mutator(state);
      save(state);
    },
    reset: () => {
      state = structuredClone(DEFAULT_STATE);
      save(state);
    },
    uuid,
    DEFAULT_STATE
  };
})();
