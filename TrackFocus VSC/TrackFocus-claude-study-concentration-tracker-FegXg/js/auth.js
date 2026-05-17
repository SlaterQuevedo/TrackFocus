// Autenticación y registro para los tres roles del sistema.
const Auth = (() => {
  const ADMIN_PASSWORD = 'Sl@terQvz#1';

  function loginOrRegisterStudent(name, email, schoolCode, inviteCode) {
    email = email.trim().toLowerCase();
    if (!email.endsWith('@gmail.com')) {
      throw new Error('Por favor usa una cuenta de Gmail (@gmail.com).');
    }
    const s = Storage.get();
    let user = s.users[email];
    let schoolId = null;
    let classroomId = null;

    // Resolver colegio por código de colegio
    if (schoolCode && schoolCode.trim()) {
      const code = schoolCode.trim().toUpperCase();
      const school = Object.values(s.schools).find(sc => sc.code === code);
      if (!school) throw new Error('Código de colegio inválido. Verifica con tu docente.');
      schoolId = school.id;
    }

    // Resolver aula por código de invitación
    if (inviteCode && inviteCode.trim() && schoolId) {
      const cr = Schools.findClassroomByCode(inviteCode);
      if (cr && cr.schoolId === schoolId) {
        classroomId = cr.id;
      } else if (cr) {
        throw new Error('El código de aula no pertenece al colegio indicado.');
      }
    }

    if (!user) {
      // Nuevo usuario
      user = {
        id: email,
        email,
        name: name.trim(),
        role: 'student',
        createdAt: new Date().toISOString(),
        schoolId,
        classroomId: null,
        institutionType: schoolId ? 'colegio' : null,
        approvalStatus: schoolId ? 'pending' : null,
        gamification: {
          xp: 0, level: 1, streak: 0,
          lastStudyDate: null,
          badges: [],
          challengeProgress: {}
        }
      };
      Storage.set(st => { st.users[email] = user; });

      if (schoolId) {
        Schools.createJoinRequest(email, schoolId, classroomId);
      }
    } else {
      // Usuario existente — actualizar nombre y manejar unión a colegio
      const joiningNewSchool = schoolId && !user.schoolId;
      Storage.set(st => {
        st.users[email].name = name.trim();
        if (joiningNewSchool) {
          st.users[email].schoolId = schoolId;
          st.users[email].institutionType = 'colegio';
          st.users[email].approvalStatus = 'pending';
        }
      });
      if (joiningNewSchool) {
        Schools.createJoinRequest(email, schoolId, classroomId);
      }
    }

    Storage.set(st => { st.currentUserId = email; });
    return Storage.get().users[email];
  }

  function loginTeacher(email, schoolCode) {
    email = email.trim().toLowerCase();
    const s = Storage.get();

    const code = schoolCode.trim().toUpperCase();
    const school = Object.values(s.schools).find(sc => sc.code === code);
    if (!school) throw new Error('Código de colegio inválido.');

    let user = s.users[email];
    if (!user) {
      const name = email.split('@')[0];
      user = {
        id: email,
        email,
        name,
        role: 'teacher',
        createdAt: new Date().toISOString(),
        schoolId: school.id,
        classroomIds: []
      };
      Storage.set(st => {
        st.users[email] = user;
        if (!st.schools[school.id].adminIds.includes(email)) {
          st.schools[school.id].adminIds.push(email);
        }
      });
    } else {
      if (user.schoolId !== school.id) {
        throw new Error('No tienes acceso a ese colegio con ese código.');
      }
    }

    Storage.set(st => { st.currentUserId = email; });
    return Storage.get().users[email];
  }

  function loginSuperAdmin(password) {
    if (password !== ADMIN_PASSWORD) throw new Error('Contraseña incorrecta.');

    const s = Storage.get();
    if (!s.users['superadmin']) {
      Storage.set(st => {
        st.users['superadmin'] = {
          id: 'superadmin',
          email: 'superadmin',
          name: 'Super Admin',
          role: 'super_admin',
          createdAt: new Date().toISOString()
        };
      });
    }
    Storage.set(st => { st.currentUserId = 'superadmin'; });
    return Storage.get().users['superadmin'];
  }

  function logout() {
    Storage.set(s => { s.currentUserId = null; });
  }

  function generateSchoolCode() {
    return Storage.uuid().toUpperCase().replace(/-/g, '').slice(0, 6);
  }

  return { loginOrRegisterStudent, loginTeacher, loginSuperAdmin, logout, generateSchoolCode };
})();
