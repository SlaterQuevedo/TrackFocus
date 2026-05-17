// Análisis inteligente basado en reglas: patrones, alertas y perfil de aprendizaje.
const Analytics = (() => {

  function classifyProfile(sessions) {
    if (sessions.length < 3) return null;

    const avg = sessions.reduce((a, b) => a + b.concentration, 0) / sessions.length;
    const avgDur = sessions.reduce((a, b) => a + b.durationMin, 0) / sessions.length;

    const hours = sessions.map(se => new Date(se.datetime).getHours());
    const nocturnal = hours.filter(h => h >= 20).length / hours.length;
    const earlyBird = hours.filter(h => h < 10).length / hours.length;

    // Calcular racha desde storage
    const s = Storage.get();
    const userId = sessions[0]?.email;
    const streak = s.users[userId]?.gamification?.streak || 0;

    if (nocturnal > 0.6) return { id: 'nocturnal',   label: 'Estudiante Nocturno',      icon: '🌙', desc: 'Tu concentración florece de noche. Aprovecha esas horas.' };
    if (earlyBird > 0.6) return { id: 'early_bird',  label: 'Madrugador',               icon: '🌅', desc: 'Estudias de madrugada o mañana temprano. ¡Gran disciplina!' };
    if (streak >= 7 && avg >= 3.8) return { id: 'disciplined', label: 'Estudiante Disciplinado', icon: '⚡', desc: 'Constancia y alta concentración: la combinación ganadora.' };
    if (avg < 2.5) return { id: 'distracted',  label: 'En Proceso de Mejora',    icon: '📈', desc: 'Tu concentración tiene margen de mejora. ¡Pequeños cambios hacen grande diferencia!' };
    if (avgDur < 30 && avg >= 3.5) return { id: 'sprinter',    label: 'Sprinter Académico',      icon: '🏃', desc: 'Sesiones cortas e intensas. Técnica Pomodoro ideal para ti.' };
    if (avgDur >= 60 && avg >= 3.5) return { id: 'marathon',    label: 'Maratonista del Estudio', icon: '🏅', desc: 'Sesiones largas con alta concentración. Notable resistencia mental.' };
    return { id: 'balanced', label: 'Estudiante Equilibrado', icon: '⚖️', desc: 'Tienes un perfil balanceado. Sigue explorando qué técnicas te funcionan mejor.' };
  }

  function generateAlerts(userId) {
    const s = Storage.get();
    const allSessions = s.sessions.filter(se => se.email === userId);
    const now = new Date();
    const alerts = [];

    if (allSessions.length === 0) return alerts;

    // Últimas 5 sesiones: concentración promedio baja
    const last5 = allSessions.slice(-5);
    const avgLast5 = last5.reduce((a, b) => a + b.concentration, 0) / last5.length;
    if (last5.length >= 5 && avgLast5 < 2.5) {
      alerts.push({ type: 'warning', msg: `⚠️ Tu concentración promedio en las últimas 5 sesiones es ${avgLast5.toFixed(1)}/5. Considera descansar o cambiar tu entorno de estudio.` });
    }

    // Caída de rendimiento semana a semana
    const from7 = new Date(now); from7.setDate(now.getDate() - 7);
    const from14 = new Date(now); from14.setDate(now.getDate() - 14);
    const thisWeek = allSessions.filter(se => new Date(se.datetime) >= from7);
    const lastWeek = allSessions.filter(se => new Date(se.datetime) >= from14 && new Date(se.datetime) < from7);
    if (thisWeek.length >= 3 && lastWeek.length >= 3) {
      const avgThis = thisWeek.reduce((a, b) => a + b.concentration, 0) / thisWeek.length;
      const avgLast = lastWeek.reduce((a, b) => a + b.concentration, 0) / lastWeek.length;
      if (avgLast - avgThis > 0.5) {
        alerts.push({ type: 'warning', msg: `📉 Tu rendimiento esta semana (${avgThis.toFixed(1)}/5) es menor que la semana pasada (${avgLast.toFixed(1)}/5).` });
      }
    }

    // Riesgo de burnout: 5+ sesiones en un día
    const byDay = {};
    allSessions.forEach(se => {
      const d = se.datetime.slice(0, 10);
      byDay[d] = (byDay[d] || 0) + 1;
    });
    const maxDay = Math.max(...Object.values(byDay));
    if (maxDay >= 5) {
      alerts.push({ type: 'warning', msg: `🔴 Detectamos que estudiaste ${maxDay} sesiones en un solo día. Recuerda descansar para mantener tu rendimiento.` });
    }

    // Ausencia prolongada
    const lastSession = allSessions[allSessions.length - 1];
    if (lastSession && allSessions.length >= 5) {
      const daysSince = Math.round((now - new Date(lastSession.datetime)) / 86400000);
      if (daysSince >= 5) {
        alerts.push({ type: 'error', msg: `😴 Llevas ${daysSince} días sin registrar sesiones. ¡El momentum es clave!` });
      }
    }

    // Momentum positivo
    const streak = s.users[userId]?.gamification?.streak || 0;
    if (streak >= 5) {
      alerts.push({ type: 'success', msg: `🔥 ¡Llevas ${streak} días seguidos estudiando! Estás en tu mejor racha. ¡Sigue así!` });
    }

    return alerts;
  }

  function detectPatterns(sessions) {
    if (sessions.length < 5) return null;

    // Mejor hora del día
    const byHour = {};
    sessions.forEach(se => {
      const h = new Date(se.datetime).getHours();
      if (!byHour[h]) byHour[h] = { sum: 0, count: 0 };
      byHour[h].sum += se.concentration;
      byHour[h].count++;
    });
    let bestHour = null, bestAvg = 0;
    for (const [h, d] of Object.entries(byHour)) {
      if (d.count >= 2) {
        const avg = d.sum / d.count;
        if (avg > bestAvg) { bestAvg = avg; bestHour = Number(h); }
      }
    }

    // Peor materia
    const bySubject = {};
    sessions.forEach(se => {
      if (!bySubject[se.subject]) bySubject[se.subject] = { sum: 0, count: 0 };
      bySubject[se.subject].sum += se.concentration;
      bySubject[se.subject].count++;
    });
    let worstSubject = null, worstAvg = 6;
    for (const [sub, d] of Object.entries(bySubject)) {
      if (d.count >= 3) {
        const avg = d.sum / d.count;
        if (avg < worstAvg) { worstAvg = avg; worstSubject = sub; }
      }
    }

    // Duración óptima
    const short = sessions.filter(se => se.durationMin <= 35);
    const medium = sessions.filter(se => se.durationMin > 35 && se.durationMin <= 60);
    const long_ = sessions.filter(se => se.durationMin > 60);
    const avgShort  = short.length  ? short.reduce((a, b) => a + b.concentration, 0) / short.length   : 0;
    const avgMedium = medium.length ? medium.reduce((a, b) => a + b.concentration, 0) / medium.length : 0;
    const avgLong   = long_.length  ? long_.reduce((a, b) => a + b.concentration, 0) / long_.length   : 0;

    let optimalDuration = null;
    if (avgShort >= avgMedium && avgShort >= avgLong && short.length >= 2)   optimalDuration = 'cortas (≤35 min)';
    else if (avgMedium >= avgLong && medium.length >= 2) optimalDuration = 'medias (35–60 min)';
    else if (long_.length >= 2) optimalDuration = 'largas (>60 min)';

    return {
      bestHour: bestHour !== null ? bestHour : null,
      bestHourAvg: bestAvg,
      worstSubject,
      worstSubjectAvg: worstAvg < 6 ? worstAvg : null,
      optimalDuration
    };
  }

  function buildRecommendations(sessions) {
    const tips = [];
    if (sessions.length < 3) {
      tips.push({ type: 'info', text: 'Registra al menos 3 sesiones para obtener recomendaciones personalizadas.' });
      return tips;
    }

    const patterns = detectPatterns(sessions);
    if (patterns) {
      if (patterns.bestHour !== null) {
        const h = patterns.bestHour;
        const label = h < 12 ? 'la mañana' : h < 18 ? 'la tarde' : 'la noche';
        tips.push({ type: 'success', text: `⏰ Tu mejor horario es a las ${h}:00 (concentración promedio: ${patterns.bestHourAvg.toFixed(1)}/5). Prioriza estudiar en ${label}.` });
      }
      if (patterns.worstSubject) {
        tips.push({ type: 'error', text: `📖 ${patterns.worstSubject} es tu materia con menor concentración (${patterns.worstSubjectAvg.toFixed(1)}/5). Intenta estudiarla en tu mejor horario.` });
      }
      if (patterns.optimalDuration) {
        tips.push({ type: 'info', text: `⏱️ Tus sesiones ${patterns.optimalDuration} son las más efectivas para tu concentración.` });
      }
    }

    // Actividad previa
    const byAct = {};
    sessions.forEach(se => {
      const k = se.previousActivity;
      if (!byAct[k]) byAct[k] = { sum: 0, count: 0 };
      byAct[k].sum += se.concentration;
      byAct[k].count++;
    });
    let bestAct = null, bestActAvg = 0;
    for (const [act, d] of Object.entries(byAct)) {
      if (d.count >= 2) {
        const avg = d.sum / d.count;
        if (avg > bestActAvg) { bestActAvg = avg; bestAct = act; }
      }
    }
    const ACTIVITY_LABELS = { comer:'Comer', dormir:'Dormir', ejercicio:'Ejercicio', cafe:'Café', redes:'Redes sociales', videojuegos:'Videojuegos', descanso:'Descanso', otra:'Otra' };
    if (bestAct && bestActAvg > 3) {
      tips.push({ type: 'success', text: `✅ Estudiar después de "${ACTIVITY_LABELS[bestAct] || bestAct}" te da mayor concentración (${bestActAvg.toFixed(1)}/5).` });
    }
    if (byAct['redes']?.count >= 3 && byAct['redes'].sum / byAct['redes'].count < 3) {
      tips.push({ type: 'error', text: `📱 Las redes sociales antes de estudiar reducen tu concentración. Intenta evitarlas 30 min antes.` });
    }
    if (byAct['ejercicio']?.count >= 2) {
      const avgEj = byAct['ejercicio'].sum / byAct['ejercicio'].count;
      if (avgEj >= 3.5) tips.push({ type: 'success', text: `🏃 El ejercicio previo mejora tu concentración (${avgEj.toFixed(1)}/5). ¡Sigue moviéndote antes de estudiar!` });
    }

    return tips;
  }

  return { classifyProfile, generateAlerts, detectPatterns, buildRecommendations };
})();
