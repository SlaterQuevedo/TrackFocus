// CRUD de sesiones de estudio.
const Sessions = (() => {

  const PREVIOUS_ACTIVITIES = [
    { id: 'comer',      label: 'Comer' },
    { id: 'dormir',     label: 'Dormir' },
    { id: 'ejercicio',  label: 'Ejercicio' },
    { id: 'cafe',       label: 'Café' },
    { id: 'redes',      label: 'Redes sociales' },
    { id: 'videojuegos',label: 'Videojuegos' },
    { id: 'descanso',   label: 'Descanso' },
    { id: 'otra',       label: 'Otra' }
  ];

  const LIKERT = [
    { v: 1, label: 'Nada concentrado' },
    { v: 2, label: 'Poco concentrado' },
    { v: 3, label: 'Regular' },
    { v: 4, label: 'Bastante concentrado' },
    { v: 5, label: 'Totalmente concentrado' }
  ];

  function add(session) {
    const required = ['email', 'datetime', 'institutionType', 'subject', 'concentration', 'durationMin', 'previousActivity'];
    for (const k of required) {
      if (session[k] === undefined || session[k] === null || session[k] === '') {
        throw new Error(`Falta el campo: ${k}`);
      }
    }
    const s = Storage.get();
    const user = s.users[session.email];
    const record = {
      id: Storage.uuid(),
      email: session.email,
      datetime: session.datetime,
      institutionType: session.institutionType,
      subject: session.subject,
      concentration: Number(session.concentration),
      durationMin: Number(session.durationMin),
      previousActivity: session.previousActivity,
      previousActivityOther: session.previousActivityOther || '',
      comment: session.comment || '',
      classroomId: user?.classroomId || session.classroomId || null
    };
    Storage.set(st => st.sessions.push(record));
    const gamResult = Gamification.awardSession(session.email, record);
    return { record, gamResult };
  }

  function addFromPomodoro(userId, subject, durationMin, concentration) {
    const s = Storage.get();
    const user = s.users[userId];
    if (!user) throw new Error('Usuario no encontrado');
    return add({
      email: userId,
      datetime: new Date().toISOString(),
      institutionType: user.institutionType || 'colegio',
      subject,
      concentration,
      durationMin,
      previousActivity: 'descanso',
      comment: 'Sesión registrada desde Pomodoro'
    });
  }

  function remove(id) {
    Storage.set(s => { s.sessions = s.sessions.filter(x => x.id !== id); });
  }

  function listFor(email, filters = {}) {
    const s = Storage.get();
    let list = s.sessions.filter(x => x.email === email);
    if (filters.subject) list = list.filter(x => x.subject === filters.subject);
    if (filters.from)    list = list.filter(x => x.datetime >= filters.from);
    if (filters.to)      list = list.filter(x => x.datetime <= filters.to);
    return list.sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  function listForClassroom(classroomId, filters = {}) {
    const s = Storage.get();
    const cr = s.classrooms[classroomId];
    if (!cr) return [];
    const ids = new Set(cr.studentIds);
    let list = s.sessions.filter(x => ids.has(x.email));
    if (filters.from) list = list.filter(x => x.datetime >= filters.from);
    if (filters.to)   list = list.filter(x => x.datetime <= filters.to);
    return list.sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  function listAll() {
    return [...Storage.get().sessions].sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  return { PREVIOUS_ACTIVITIES, LIKERT, add, addFromPomodoro, remove, listFor, listForClassroom, listAll };
})();
