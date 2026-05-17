// Catálogo dinámico de materias por institución + materias personalizadas por estudiante.
const Subjects = (() => {

  const INSTITUTIONS = [
    { id: 'colegio', label: 'Colegio', icon: '🎒', enabled: true }
    // Futuro: universidad, academia, autodidacta… (estructura ya soporta varios)
  ];

  function listInstitutions() {
    return INSTITUTIONS;
  }

  function getInstitution(id) {
    return INSTITUTIONS.find(i => i.id === id);
  }

  function listSubjects(institutionId, email) {
    const s = Storage.get();
    const base = s.subjectsByInstitution[institutionId] || [];
    const custom = (email && s.customSubjects[email]) || [];
    // Sin duplicados, conservando orden.
    const seen = new Set();
    return [...base, ...custom].filter(x => {
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function addCustomSubject(email, name) {
    const clean = (name || '').trim();
    if (!clean) throw new Error('El nombre no puede estar vacío.');
    Storage.set(s => {
      if (!s.customSubjects[email]) s.customSubjects[email] = [];
      const exists = s.customSubjects[email].some(x => x.toLowerCase() === clean.toLowerCase());
      if (!exists) s.customSubjects[email].push(clean);
    });
  }

  function removeCustomSubject(email, name) {
    Storage.set(s => {
      if (!s.customSubjects[email]) return;
      s.customSubjects[email] = s.customSubjects[email].filter(x => x !== name);
    });
  }

  return { INSTITUTIONS, listInstitutions, getInstitution, listSubjects, addCustomSubject, removeCustomSubject };
})();
