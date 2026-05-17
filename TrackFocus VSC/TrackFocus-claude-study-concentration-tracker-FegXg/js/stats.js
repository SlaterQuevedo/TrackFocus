// Cálculos estadísticos sobre las sesiones.
const Stats = (() => {

  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function hourBucket(iso) {
    const h = new Date(iso).getHours();
    if (h < 6) return 'Madrugada (00–06)';
    if (h < 12) return 'Mañana (06–12)';
    if (h < 18) return 'Tarde (12–18)';
    return 'Noche (18–24)';
  }

  function summary(sessions) {
    const total = sessions.length;
    const totalMin = sessions.reduce((a, s) => a + s.durationMin, 0);
    const avgConc = +avg(sessions.map(s => s.concentration)).toFixed(2);
    const avgDur = total ? Math.round(totalMin / total) : 0;
    return { total, totalMin, avgConc, avgDur };
  }

  function bySubject(sessions) {
    const map = {};
    for (const s of sessions) {
      if (!map[s.subject]) map[s.subject] = [];
      map[s.subject].push(s);
    }
    return Object.entries(map).map(([subject, list]) => ({
      subject,
      count: list.length,
      avgConcentration: +avg(list.map(s => s.concentration)).toFixed(2),
      totalMin: list.reduce((a, x) => a + x.durationMin, 0)
    })).sort((a, b) => b.avgConcentration - a.avgConcentration);
  }

  function byHourBucket(sessions) {
    const map = {};
    for (const s of sessions) {
      const k = hourBucket(s.datetime);
      if (!map[k]) map[k] = [];
      map[k].push(s);
    }
    return Object.entries(map).map(([bucket, list]) => ({
      bucket,
      count: list.length,
      avgConcentration: +avg(list.map(s => s.concentration)).toFixed(2)
    })).sort((a, b) => b.avgConcentration - a.avgConcentration);
  }

  function byPreviousActivity(sessions) {
    const map = {};
    for (const s of sessions) {
      const k = s.previousActivity;
      if (!map[k]) map[k] = [];
      map[k].push(s);
    }
    return Object.entries(map).map(([activity, list]) => ({
      activity,
      count: list.length,
      avgConcentration: +avg(list.map(s => s.concentration)).toFixed(2)
    })).sort((a, b) => b.avgConcentration - a.avgConcentration);
  }

  function likertDistribution(sessions) {
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of sessions) dist[s.concentration] = (dist[s.concentration] || 0) + 1;
    return dist;
  }

  return { summary, bySubject, byHourBucket, byPreviousActivity, likertDistribution, hourBucket };
})();
