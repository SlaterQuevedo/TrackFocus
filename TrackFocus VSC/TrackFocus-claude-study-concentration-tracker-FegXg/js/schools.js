// CRUD de colegios y aulas + sistema de solicitudes de ingreso.
const Schools = (() => {

  // --- Colegios ---

  function createSchool(name) {
    const id = Storage.uuid();
    const code = Auth.generateSchoolCode();
    Storage.set(s => {
      s.schools[id] = {
        id, name: name.trim(), code,
        adminIds: [],
        createdAt: new Date().toISOString()
      };
    });
    return Storage.get().schools[id];
  }

  function listSchools() {
    return Object.values(Storage.get().schools)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getSchool(id) {
    return Storage.get().schools[id] || null;
  }

  function deleteSchool(id) {
    Storage.set(s => {
      Object.values(s.users).forEach(u => {
        if (u.schoolId === id) {
          u.schoolId = null;
          if (u.role === 'student') { u.classroomId = null; u.institutionType = null; u.approvalStatus = null; }
          if (u.role === 'teacher') { u.classroomIds = []; }
        }
      });
      Object.keys(s.classrooms).forEach(cid => {
        if (s.classrooms[cid].schoolId === id) delete s.classrooms[cid];
      });
      // Remove school requests
      if (s.classroomRequests) {
        Object.keys(s.classroomRequests).forEach(rid => {
          if (s.classroomRequests[rid].schoolId === id) delete s.classroomRequests[rid];
        });
      }
      delete s.schools[id];
    });
  }

  function updateSchool(id, name) {
    Storage.set(s => { if (s.schools[id]) s.schools[id].name = name.trim(); });
  }

  // --- Aulas ---

  function _generateInviteCode() {
    return Storage.uuid().toUpperCase().replace(/-/g, '').slice(0, 8);
  }

  function createClassroom(schoolId, grade, section) {
    const id = Storage.uuid();
    const name = `${grade.trim()} ${section.trim()}`;
    const inviteCode = _generateInviteCode();
    Storage.set(s => {
      s.classrooms[id] = {
        id, schoolId, name, grade: grade.trim(), section: section.trim(),
        teacherIds: [], studentIds: [],
        inviteCode,
        createdAt: new Date().toISOString()
      };
    });
    return Storage.get().classrooms[id];
  }

  function regenerateInviteCode(classroomId) {
    const code = _generateInviteCode();
    Storage.set(s => { if (s.classrooms[classroomId]) s.classrooms[classroomId].inviteCode = code; });
    return code;
  }

  function findClassroomByCode(code) {
    const s = Storage.get();
    return Object.values(s.classrooms).find(c => c.inviteCode === code.trim().toUpperCase()) || null;
  }

  function listClassrooms(schoolId) {
    return Object.values(Storage.get().classrooms)
      .filter(c => c.schoolId === schoolId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getClassroom(id) {
    return Storage.get().classrooms[id] || null;
  }

  function deleteClassroom(id) {
    Storage.set(s => {
      Object.values(s.users).forEach(u => {
        if (u.classroomId === id) u.classroomId = null;
        if (u.classroomIds) u.classroomIds = u.classroomIds.filter(c => c !== id);
      });
      delete s.classrooms[id];
    });
  }

  // --- Membresía directa (solo para profesores/admin) ---

  function addStudentToClassroom(studentId, classroomId) {
    Storage.set(s => {
      const cr = s.classrooms[classroomId];
      if (!cr) return;
      if (s.users[studentId]?.classroomId) {
        const prev = s.classrooms[s.users[studentId].classroomId];
        if (prev) prev.studentIds = prev.studentIds.filter(x => x !== studentId);
      }
      if (!cr.studentIds.includes(studentId)) cr.studentIds.push(studentId);
      if (s.users[studentId]) {
        s.users[studentId].classroomId = classroomId;
        s.users[studentId].approvalStatus = 'approved';
      }
    });
  }

  function removeStudentFromClassroom(studentId, classroomId) {
    Storage.set(s => {
      const cr = s.classrooms[classroomId];
      if (cr) cr.studentIds = cr.studentIds.filter(x => x !== studentId);
      if (s.users[studentId]?.classroomId === classroomId) {
        s.users[studentId].classroomId = null;
        s.users[studentId].approvalStatus = null;
      }
    });
  }

  function moveStudent(studentId, toClassroomId) {
    addStudentToClassroom(studentId, toClassroomId);
  }

  function listStudentsInClassroom(classroomId) {
    const s = Storage.get();
    const cr = s.classrooms[classroomId];
    if (!cr) return [];
    return cr.studentIds.map(id => s.users[id]).filter(Boolean);
  }

  function listStudentsInSchool(schoolId) {
    const s = Storage.get();
    return Object.values(s.users)
      .filter(u => u.role === 'student' && u.schoolId === schoolId);
  }

  function getSchoolStats(schoolId) {
    const s = Storage.get();
    const students = listStudentsInSchool(schoolId);
    const studentIds = students.map(u => u.id);
    const sessions = s.sessions.filter(se => studentIds.includes(se.email));
    const classrooms = listClassrooms(schoolId);
    return {
      studentCount: students.length,
      classroomCount: classrooms.length,
      sessionCount: sessions.length,
      avgConcentration: sessions.length
        ? (sessions.reduce((a, b) => a + b.concentration, 0) / sessions.length).toFixed(1)
        : '—'
    };
  }

  // --- Sistema de solicitudes ---

  function _ensureRequests(s) {
    if (!s.classroomRequests) s.classroomRequests = {};
  }

  function createJoinRequest(studentId, schoolId, classroomId) {
    const s = Storage.get();
    const student = s.users[studentId];
    if (!student) return null;
    const id = Storage.uuid();
    Storage.set(st => {
      _ensureRequests(st);
      st.classroomRequests[id] = {
        id,
        studentId,
        studentName: student.name,
        studentEmail: student.email,
        schoolId,
        classroomId: classroomId || null,
        type: 'join',
        fromClassroomId: null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null
      };
      st.users[studentId].approvalStatus = 'pending';
    });
    return Storage.get().classroomRequests[id];
  }

  function createChangeRequest(studentId, toClassroomId) {
    const s = Storage.get();
    const student = s.users[studentId];
    if (!student) return null;
    const id = Storage.uuid();
    Storage.set(st => {
      _ensureRequests(st);
      st.classroomRequests[id] = {
        id,
        studentId,
        studentName: student.name,
        studentEmail: student.email,
        schoolId: student.schoolId,
        classroomId: toClassroomId,
        type: 'change',
        fromClassroomId: student.classroomId || null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null
      };
    });
    return Storage.get().classroomRequests[id];
  }

  function listRequestsForSchool(schoolId) {
    const s = Storage.get();
    if (!s.classroomRequests) return [];
    return Object.values(s.classroomRequests)
      .filter(r => r.schoolId === schoolId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function getPendingCount(schoolId) {
    return listRequestsForSchool(schoolId).filter(r => r.status === 'pending').length;
  }

  function approveRequest(requestId, teacherId, targetClassroomId) {
    const s = Storage.get();
    if (!s.classroomRequests) return;
    const req = s.classroomRequests[requestId];
    if (!req || req.status !== 'pending') return;

    const classroomId = targetClassroomId || req.classroomId;
    Storage.set(st => {
      _ensureRequests(st);
      st.classroomRequests[requestId].status = 'approved';
      st.classroomRequests[requestId].resolvedAt = new Date().toISOString();
      st.classroomRequests[requestId].resolvedBy = teacherId;

      const student = st.users[req.studentId];
      if (!student) return;

      student.approvalStatus = 'approved';

      if (classroomId && st.classrooms[classroomId]) {
        // Remove from old classroom
        if (student.classroomId && st.classrooms[student.classroomId]) {
          st.classrooms[student.classroomId].studentIds =
            st.classrooms[student.classroomId].studentIds.filter(x => x !== req.studentId);
        }
        student.classroomId = classroomId;
        if (!st.classrooms[classroomId].studentIds.includes(req.studentId)) {
          st.classrooms[classroomId].studentIds.push(req.studentId);
        }
      }
    });
  }

  function rejectRequest(requestId, teacherId) {
    const s = Storage.get();
    if (!s.classroomRequests) return;
    const req = s.classroomRequests[requestId];
    if (!req || req.status !== 'pending') return;
    Storage.set(st => {
      _ensureRequests(st);
      st.classroomRequests[requestId].status = 'rejected';
      st.classroomRequests[requestId].resolvedAt = new Date().toISOString();
      st.classroomRequests[requestId].resolvedBy = teacherId;
      if (req.type === 'join' && st.users[req.studentId]) {
        st.users[req.studentId].approvalStatus = 'rejected';
      }
    });
  }

  function getStudentRequests(studentId) {
    const s = Storage.get();
    if (!s.classroomRequests) return [];
    return Object.values(s.classroomRequests)
      .filter(r => r.studentId === studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return {
    createSchool, listSchools, getSchool, deleteSchool, updateSchool,
    createClassroom, listClassrooms, getClassroom, deleteClassroom,
    regenerateInviteCode, findClassroomByCode,
    addStudentToClassroom, removeStudentFromClassroom, moveStudent,
    listStudentsInClassroom, listStudentsInSchool, getSchoolStats,
    createJoinRequest, createChangeRequest, listRequestsForSchool,
    getPendingCount, approveRequest, rejectRequest, getStudentRequests
  };
})();
