// Exportación CSV. Usa BOM UTF-8 para compatibilidad directa con Excel.
const Exporter = (() => {

  const COLUMNS = [
    { k: 'datetime', h: 'Fecha y hora' },
    { k: 'email', h: 'Gmail' },
    { k: 'institutionType', h: 'Institución' },
    { k: 'subject', h: 'Materia' },
    { k: 'concentration', h: 'Concentración (1-5)' },
    { k: 'durationMin', h: 'Duración (min)' },
    { k: 'previousActivity', h: 'Actividad previa' },
    { k: 'previousActivityOther', h: 'Otra actividad' },
    { k: 'comment', h: 'Comentario' }
  ];

  function escape(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(sessions) {
    const header = COLUMNS.map(c => c.h).join(';');
    const rows = sessions.map(s => COLUMNS.map(c => escape(s[c.k])).join(';'));
    return '﻿' + [header, ...rows].join('\n');
  }

  function download(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportSessions(sessions, filename) {
    download(filename || `trackfocus-sesiones-${new Date().toISOString().slice(0,10)}.csv`, toCsv(sessions));
  }

  return { exportSessions, toCsv };
})();
