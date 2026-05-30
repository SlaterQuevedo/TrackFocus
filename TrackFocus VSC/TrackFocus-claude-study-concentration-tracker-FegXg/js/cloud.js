// Capa de sincronización Supabase ↔ estado en memoria.
// - bootstrap(): trae todo lo necesario para arrancar la app autenticada.
// - syncDiff(before, after): compara dos snapshots del estado y empuja los cambios al cloud.
// Diseñado para que el resto del código (sessions.js, schools.js, gamification.js, etc.)
// no necesite cambios: siguen llamando a Storage.set(mutator) y el sync ocurre por debajo.
const Cloud = (() => {

  // ----- MAPEOS (JS shape ↔ DB shape) -----

  const toDb = {
    user: u => ({
      id:                 u.id,
      email:              u.email,
      name:               u.name,
      avatar_url:         u.avatarUrl || null,
      role:               u.role,
      school_id:          u.schoolId || null,
      classroom_id:       u.classroomId || null,
      institution_type:   u.institutionType || null,
      approval_status:    u.approvalStatus || null,
      xp:                 u.gamification?.xp ?? 0,
      level:              u.gamification?.level ?? 1,
      streak:             u.gamification?.streak ?? 0,
      last_study_date:    u.gamification?.lastStudyDate || null,
      badges:             u.gamification?.badges || [],
      challenge_progress: u.gamification?.challengeProgress || {},
      classroom_ids:      u.classroomIds || [],
      updated_at:         new Date().toISOString()
    }),
    school: s => ({
      id: s.id, name: s.name, code: s.code,
      admin_ids: s.adminIds || [],
      created_at: s.createdAt
    }),
    classroom: c => ({
      id: c.id, school_id: c.schoolId, name: c.name,
      grade: c.grade || null, section: c.section || null,
      teacher_ids: c.teacherIds || [], student_ids: c.studentIds || [],
      invite_code: c.inviteCode,
      created_at: c.createdAt
    }),
    session: s => ({
      id: s.id, email: s.email, datetime: s.datetime,
      institution_type: s.institutionType,
      subject: s.subject,
      concentration: s.concentration,
      duration_min: s.durationMin,
      previous_activity: s.previousActivity,
      previous_activity_other: s.previousActivityOther || '',
      comment: s.comment || '',
      classroom_id: s.classroomId || null
    }),
    request: r => ({
      id: r.id,
      student_id: r.studentId,
      student_name: r.studentName,
      student_email: r.studentEmail,
      school_id: r.schoolId,
      classroom_id: r.classroomId || null,
      type: r.type,
      from_classroom_id: r.fromClassroomId || null,
      status: r.status,
      created_at: r.createdAt,
      resolved_at: r.resolvedAt || null,
      resolved_by: r.resolvedBy || null
    }),
    uploadedFile: f => ({
      id: f.id,
      user_id: f.userId,
      file_name: f.fileName,
      file_type: f.fileType,
      file_size: f.fileSize,
      storage_path: f.storagePath,
      uploaded_at: f.uploadedAt,
      session_id: f.sessionId || null,
      classroom_id: f.classroomId || null,
      metadata: f.metadata || {},
      created_at: f.createdAt
    })
  };

  const fromDb = {
    user: r => ({
      id: r.id,
      email: r.email,
      name: r.name,
      avatarUrl: r.avatar_url,
      role: r.role,
      schoolId: r.school_id,
      classroomId: r.classroom_id,
      institutionType: r.institution_type,
      approvalStatus: r.approval_status,
      classroomIds: r.classroom_ids || [],
      createdAt: r.created_at,
      gamification: {
        xp: r.xp || 0,
        level: r.level || 1,
        streak: r.streak || 0,
        lastStudyDate: r.last_study_date,
        badges: r.badges || [],
        challengeProgress: r.challenge_progress || {}
      }
    }),
    school: r => ({
      id: r.id, name: r.name, code: r.code,
      adminIds: r.admin_ids || [],
      createdAt: r.created_at
    }),
    classroom: r => ({
      id: r.id, schoolId: r.school_id, name: r.name,
      grade: r.grade, section: r.section,
      teacherIds: r.teacher_ids || [], studentIds: r.student_ids || [],
      inviteCode: r.invite_code,
      createdAt: r.created_at
    }),
    session: r => ({
      id: r.id, email: r.email, datetime: r.datetime,
      institutionType: r.institution_type,
      subject: r.subject,
      concentration: r.concentration,
      durationMin: r.duration_min,
      previousActivity: r.previous_activity,
      previousActivityOther: r.previous_activity_other || '',
      comment: r.comment || '',
      classroomId: r.classroom_id
    }),
    request: r => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.student_name,
      studentEmail: r.student_email,
      schoolId: r.school_id,
      classroomId: r.classroom_id,
      type: r.type,
      fromClassroomId: r.from_classroom_id,
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by
    }),
    uploadedFile: r => ({
      id: r.id,
      userId: r.user_id,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: r.file_size,
      storagePath: r.storage_path,
      uploadedAt: r.uploaded_at,
      sessionId: r.session_id,
      classroomId: r.classroom_id,
      metadata: r.metadata || {},
      createdAt: r.created_at
    })
  };

  // ----- BOOTSTRAP -----

  // Trae todo el estado relevante para la sesión actual.
  // Para un MVP: traemos todo (limitado por las políticas RLS).
  async function bootstrap() {
    if (!window.SB) throw new Error('Supabase no está configurado.');

    const [usersR, schoolsR, classroomsR, sessionsR, customR, requestsR, filesR] = await Promise.all([
      window.SB.from('users').select('*'),
      window.SB.from('schools').select('*'),
      window.SB.from('classrooms').select('*'),
      window.SB.from('study_sessions').select('*'),
      window.SB.from('custom_subjects').select('*'),
      window.SB.from('classroom_requests').select('*'),
      window.SB.from('uploaded_files').select('*')
    ]);

    for (const r of [usersR, schoolsR, classroomsR, sessionsR, customR, requestsR, filesR]) {
      if (r.error) throw new Error('Cloud bootstrap: ' + r.error.message);
    }

    const state = {
      schemaVersion: 2,
      currentUserId: null,
      users: {},
      schools: {},
      classrooms: {},
      sessions: [],
      uploadedFiles: {},
      subjectsByInstitution: { colegio: ['Matemática','Comunicación','Física','Química','Inglés','Historia'] },
      customSubjects: {},
      students: {},
      classroomRequests: {}
    };

    (usersR.data      || []).forEach(r => { state.users[r.id]      = fromDb.user(r); });
    (schoolsR.data    || []).forEach(r => { state.schools[r.id]    = fromDb.school(r); });
    (classroomsR.data || []).forEach(r => { state.classrooms[r.id] = fromDb.classroom(r); });
    state.sessions = (sessionsR.data || []).map(fromDb.session);
    (customR.data || []).forEach(row => {
      if (!state.customSubjects[row.email]) state.customSubjects[row.email] = [];
      state.customSubjects[row.email].push(row.subject);
    });
    (filesR.data || []).forEach(r => { state.uploadedFiles[r.id] = fromDb.uploadedFile(r); });
    (requestsR.data || []).forEach(r => { state.classroomRequests[r.id] = fromDb.request(r); });

    return state;
  }

  // ----- DIFF SYNC -----

  // Compara dos snapshots por su forma y empuja las diferencias al cloud.
  // Las operaciones se ejecutan en paralelo; los errores se loggean pero no bloquean la UI.
  async function syncDiff(before, after) {
    if (!window.SB) return;
    const ops = [];

    // USERS
    diffMap(before.users, after.users,
      row => ops.push(window.SB.from('users').upsert(toDb.user(row))),
      id  => ops.push(window.SB.from('users').delete().eq('id', id)));

    // SCHOOLS
    diffMap(before.schools, after.schools,
      row => ops.push(window.SB.from('schools').upsert(toDb.school(row))),
      id  => ops.push(window.SB.from('schools').delete().eq('id', id)));

    // CLASSROOMS
    diffMap(before.classrooms, after.classrooms,
      row => ops.push(window.SB.from('classrooms').upsert(toDb.classroom(row))),
      id  => ops.push(window.SB.from('classrooms').delete().eq('id', id)));

    // SESSIONS (array)
    const afterSids = new Set(after.sessions.map(s => s.id));
    for (const s of after.sessions) {
      const prev = before.sessions.find(x => x.id === s.id);
      if (!prev) ops.push(window.SB.from('study_sessions').insert(toDb.session(s)));
      else if (JSON.stringify(prev) !== JSON.stringify(s))
        ops.push(window.SB.from('study_sessions').upsert(toDb.session(s)));
    }
    for (const s of before.sessions) {
      if (!afterSids.has(s.id))
        ops.push(window.SB.from('study_sessions').delete().eq('id', s.id));
    }

    // CUSTOM SUBJECTS (objeto email → array)
    const allEmails = new Set([...Object.keys(before.customSubjects), ...Object.keys(after.customSubjects)]);
    for (const email of allEmails) {
      const prev = before.customSubjects[email] || [];
      const curr = after.customSubjects[email]  || [];
      for (const sub of curr) {
        if (!prev.includes(sub))
          ops.push(window.SB.from('custom_subjects').insert({ email, subject: sub }));
      }
      for (const sub of prev) {
        if (!curr.includes(sub))
          ops.push(window.SB.from('custom_subjects').delete().eq('email', email).eq('subject', sub));
      }
    }

    // UPLOADED FILES
    diffMap(before.uploadedFiles, after.uploadedFiles,
      row => ops.push(window.SB.from('uploaded_files').upsert(toDb.uploadedFile(row))),
      id  => ops.push(window.SB.from('uploaded_files').delete().eq('id', id)));

    // CLASSROOM REQUESTS
    diffMap(before.classroomRequests, after.classroomRequests,
      row => ops.push(window.SB.from('classroom_requests').upsert(toDb.request(row))),
      id  => ops.push(window.SB.from('classroom_requests').delete().eq('id', id)));

    if (ops.length === 0) return;

    const results = await Promise.allSettled(ops);
    const failures = results.filter(r => r.status === 'rejected' || (r.value && r.value.error));
    if (failures.length > 0) {
      console.error('[Cloud] Sync errors:', failures.map(f => f.reason || f.value?.error));
    }
  }

  function diffMap(before, after, onUpsert, onDelete) {
    for (const [id, row] of Object.entries(after)) {
      const prev = before[id];
      if (!prev || JSON.stringify(prev) !== JSON.stringify(row)) onUpsert(row);
    }
    for (const id of Object.keys(before)) {
      if (!(id in after)) onDelete(id);
    }
  }

  // ----- REALTIME (opcional, multi-dispositivo) -----

  let _channel = null;

  function subscribeRealtime(onChange) {
    if (!window.SB || _channel) return;
    _channel = window.SB
      .channel('trackfocus-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' },          onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uploaded_files' },  onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_requests' }, onChange)
      .subscribe();
  }

  function unsubscribeRealtime() {
    if (_channel) { window.SB.removeChannel(_channel); _channel = null; }
  }

  return { bootstrap, syncDiff, subscribeRealtime, unsubscribeRealtime, toDb, fromDb };
})();
