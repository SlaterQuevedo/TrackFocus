// Sistema de gamificación: XP, niveles, rachas, insignias y leaderboard.
const Gamification = (() => {

  const XP_VALUES = {
    SESSION_LOGGED:    10,
    HIGH_CONCENTRATION:20,  // concentración >= 4
    PERFECT_DAY:       15,  // 3+ sesiones en un mismo día
    STREAK_BONUS:       5   // por día de racha (máx 50 XP)
  };

  const LEVELS = Array.from({ length: 20 }, (_, i) => ({
    level: i + 1,
    xpRequired: 50 * (i + 1) * (i + 2) / 2,
    title: [
      'Principiante', 'Aprendiz', 'Estudiante', 'Dedicado', 'Concentrado',
      'Enfocado', 'Disciplinado', 'Avanzado', 'Experto', 'Maestro',
      'Élite', 'Campeón', 'Leyenda', 'Sabio', 'Prodigio',
      'Virtuoso', 'Genio', 'Iluminado', 'Trascendente', 'TrackMaster'
    ][i]
  }));

  const BADGES = [
    { id: 'primera_sesion',   label: 'Primera Sesión',      icon: '🎯', desc: 'Registra tu primera sesión de estudio' },
    { id: 'semana_perfecta',  label: 'Semana Perfecta',     icon: '🏆', desc: '7 días consecutivos de estudio' },
    { id: 'maestro_enfoque',  label: 'Maestro del Enfoque', icon: '🧠', desc: '10 sesiones con concentración 5/5' },
    { id: 'maratonista',      label: 'Maratonista',         icon: '⏱️', desc: 'Acumula 1000 minutos de estudio' },
    { id: 'pomodoro_master',  label: 'Pomodoro Master',     icon: '🍅', desc: 'Completa 10 sesiones desde el Pomodoro' },
    { id: 'racha_3',          label: 'Racha de Fuego',      icon: '🔥', desc: '3 días de estudio consecutivos' },
    { id: 'racha_7',          label: 'Semana de Hierro',    icon: '⚡', desc: '7 días consecutivos' },
    { id: 'racha_30',         label: 'Mes de Diamante',     icon: '💎', desc: '30 días consecutivos' },
    { id: 'multimaterias',    label: 'Multimaterias',       icon: '📚', desc: 'Estudia 5 materias distintas' },
    { id: 'noctambulo',       label: 'Noctámbulo',          icon: '🌙', desc: '10 sesiones después de las 22:00' },
    { id: 'madrugador',       label: 'Madrugador',          icon: '🌅', desc: '10 sesiones antes de las 8:00' }
  ];

  function getLevelInfo(xp) {
    let current = LEVELS[0];
    let next = LEVELS[1];
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (xp >= LEVELS[i].xpRequired) {
        current = LEVELS[i];
        next = LEVELS[i + 1] || null;
        break;
      }
    }
    const prevXp = current.xpRequired;
    const nextXp = next ? next.xpRequired : current.xpRequired;
    const progress = next ? Math.min(100, Math.max(0, ((xp - prevXp) / (nextXp - prevXp)) * 100)) : 100;
    return { current, next, progress: Math.round(progress), xp };
  }

  function recalculateLevel(userId) {
    const s = Storage.get();
    const user = s.users[userId];
    if (!user || !user.gamification) return;
    const xp = user.gamification.xp;
    let level = 1;
    for (const l of LEVELS) {
      if (xp >= l.xpRequired) level = l.level;
    }
    Storage.set(st => { st.users[userId].gamification.level = level; });
  }

  function updateStreak(userId) {
    const s = Storage.get();
    const user = s.users[userId];
    if (!user || !user.gamification) return 0;

    const todayStr = new Date().toISOString().slice(0, 10);
    const lastDate = user.gamification.lastStudyDate;

    let streak = user.gamification.streak || 0;

    if (!lastDate) {
      streak = 1;
    } else if (lastDate === todayStr) {
      // Ya estudió hoy, no modificar racha
    } else {
      const last = new Date(lastDate);
      const today = new Date(todayStr);
      const diffDays = Math.round((today - last) / 86400000);
      streak = diffDays === 1 ? streak + 1 : 1;
    }

    Storage.set(st => {
      st.users[userId].gamification.streak = streak;
      st.users[userId].gamification.lastStudyDate = todayStr;
    });
    return streak;
  }

  function checkBadges(userId) {
    const s = Storage.get();
    const user = s.users[userId];
    if (!user || !user.gamification) return [];

    const sessions = s.sessions.filter(se => se.email === userId);
    const existing = new Set(user.gamification.badges);
    const toEarn = [];

    function earn(badgeId) {
      if (!existing.has(badgeId)) {
        existing.add(badgeId);
        toEarn.push(badgeId);
      }
    }

    if (sessions.length >= 1)   earn('primera_sesion');
    if (user.gamification.streak >= 3)  earn('racha_3');
    if (user.gamification.streak >= 7)  earn('racha_7');
    if (user.gamification.streak >= 30) earn('racha_30');
    if (user.gamification.streak >= 7)  earn('semana_perfecta');

    const highFocus = sessions.filter(se => se.concentration === 5).length;
    if (highFocus >= 10) earn('maestro_enfoque');

    const totalMin = sessions.reduce((a, b) => a + b.durationMin, 0);
    if (totalMin >= 1000) earn('maratonista');

    const pomSessions = sessions.filter(se => se.comment && se.comment.includes('Pomodoro')).length;
    if (pomSessions >= 10) earn('pomodoro_master');

    const subjects = new Set(sessions.map(se => se.subject));
    if (subjects.size >= 5) earn('multimaterias');

    const nocturnalSessions = sessions.filter(se => {
      const h = new Date(se.datetime).getHours();
      return h >= 22;
    }).length;
    if (nocturnalSessions >= 10) earn('noctambulo');

    const earlyBirdSessions = sessions.filter(se => {
      const h = new Date(se.datetime).getHours();
      return h < 8;
    }).length;
    if (earlyBirdSessions >= 10) earn('madrugador');

    if (toEarn.length > 0) {
      Storage.set(st => {
        toEarn.forEach(badgeId => {
          if (!st.users[userId].gamification.badges.includes(badgeId)) {
            st.users[userId].gamification.badges.push(badgeId);
          }
        });
      });
    }

    return toEarn.map(id => BADGES.find(b => b.id === id)).filter(Boolean);
  }

  function awardSession(userId, record) {
    const s = Storage.get();
    const user = s.users[userId];
    if (!user || !user.gamification) return { xpEarned: 0, newBadges: [], levelUp: false };

    let xpEarned = XP_VALUES.SESSION_LOGGED;
    if (record.concentration >= 4) xpEarned += XP_VALUES.HIGH_CONCENTRATION;

    // Bono por día perfecto (3+ sesiones hoy)
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySessions = s.sessions.filter(se =>
      se.email === userId && se.datetime.slice(0, 10) === todayStr
    );
    if (todaySessions.length >= 3) xpEarned += XP_VALUES.PERFECT_DAY;

    // Calcular racha sin mutar estado aún
    const lastDate = user.gamification.lastStudyDate;
    let streak = user.gamification.streak || 0;
    if (!lastDate) {
      streak = 1;
    } else if (lastDate !== todayStr) {
      const diffDays = Math.round((new Date(todayStr) - new Date(lastDate)) / 86400000);
      streak = diffDays === 1 ? streak + 1 : 1;
    }

    const streakBonus = Math.min(50, streak * XP_VALUES.STREAK_BONUS);
    xpEarned += streakBonus;

    // Calcular nuevo XP y nivel
    const prevLevel = user.gamification.level || 1;
    const newXp = (user.gamification.xp || 0) + xpEarned;
    let newLevel = 1;
    for (const l of LEVELS) { if (newXp >= l.xpRequired) newLevel = l.level; }

    // Un solo Storage.set para racha + XP + nivel
    Storage.set(st => {
      const g = st.users[userId].gamification;
      g.streak = streak;
      g.lastStudyDate = todayStr;
      g.xp = newXp;
      g.level = newLevel;
    });

    const newBadges = checkBadges(userId);
    return { xpEarned, newBadges, levelUp: newLevel > prevLevel, newLevel };
  }

  // Calcula XP de sesiones en un rango de fechas (para leaderboard real)
  function computeXpFromSessions(sessions) {
    let xp = 0;
    const byDay = {};
    for (const se of sessions) {
      xp += XP_VALUES.SESSION_LOGGED;
      if (se.concentration >= 4) xp += XP_VALUES.HIGH_CONCENTRATION;
      const day = se.datetime.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }
    // Bono de días perfectos
    for (const count of Object.values(byDay)) {
      if (count >= 3) xp += XP_VALUES.PERFECT_DAY;
    }
    return xp;
  }

  function getLeaderboard(scope, scopeId, period) {
    const s = Storage.get();
    const now = new Date();
    let fromDate = null;
    if (period === 'week') {
      fromDate = new Date(now);
      fromDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      fromDate = new Date(now);
      fromDate.setDate(now.getDate() - 30);
    }

    // Determinar qué estudiantes aplican
    let studentIds;
    if (scope === 'classroom' && scopeId) {
      const cr = s.classrooms[scopeId];
      studentIds = new Set(cr ? cr.studentIds : []);
    } else if (scope === 'school' && scopeId) {
      studentIds = new Set(
        Object.values(s.users)
          .filter(u => u.role === 'student' && u.schoolId === scopeId)
          .map(u => u.id)
      );
    } else if (scope === 'grade' && scopeId) {
      // scopeId = schoolId + ':' + grade
      const [schoolId, grade] = scopeId.split(':');
      const classroomsOfGrade = Object.values(s.classrooms)
        .filter(c => c.schoolId === schoolId && c.grade === grade);
      studentIds = new Set(classroomsOfGrade.flatMap(c => c.studentIds));
    } else {
      // global: todos los estudiantes
      studentIds = new Set(
        Object.values(s.users).filter(u => u.role === 'student').map(u => u.id)
      );
    }

    const entries = [];
    for (const userId of studentIds) {
      const user = s.users[userId];
      if (!user) continue;
      let sessions = s.sessions.filter(se => se.email === userId);
      if (fromDate) sessions = sessions.filter(se => new Date(se.datetime) >= fromDate);

      const xp = computeXpFromSessions(sessions);
      const gam = user.gamification || {};
      entries.push({
        userId,
        name: user.name,
        xp,
        level: gam.level || 1,
        streak: gam.streak || 0,
        sessionCount: sessions.length,
        avgConcentration: sessions.length
          ? (sessions.reduce((a, b) => a + b.concentration, 0) / sessions.length).toFixed(1)
          : '0.0'
      });
    }

    entries.sort((a, b) => b.xp - a.xp || b.streak - a.streak);
    entries.forEach((e, i) => { e.rank = i + 1; });
    return entries;
  }

  function getWeeklyXP(userId) {
    const s = Storage.get();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const sessions = s.sessions.filter(se =>
      se.email === userId && new Date(se.datetime) >= from
    );
    return computeXpFromSessions(sessions);
  }

  return {
    BADGES,
    LEVELS,
    getLevelInfo,
    awardSession,
    recalculateLevel,
    checkBadges,
    getLeaderboard,
    getWeeklyXP,
    computeXpFromSessions
  };
})();
