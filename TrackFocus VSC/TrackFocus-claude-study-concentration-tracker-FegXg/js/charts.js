// Wrapper de Chart.js con registry automático para evitar "canvas already in use".
const Charts = (() => {
  const registry = {};

  function destroy(id) {
    if (registry[id]) {
      try { registry[id].destroy(); } catch(e) {}
      delete registry[id];
    }
  }

  function destroyAll() {
    Object.keys(registry).forEach(destroy);
  }

  function create(canvasId, config) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;
    const chart = new Chart(canvas, config);
    registry[canvasId] = chart;
    return chart;
  }

  const COLORS = {
    primary:      'rgba(200,155,109,0.85)',
    primaryLight: 'rgba(200,155,109,0.15)',
    accent:       'rgba(139,92,246,0.85)',
    accentLight:  'rgba(139,92,246,0.15)',
    blue:         'rgba(59,130,246,0.85)',
    blueLight:    'rgba(59,130,246,0.15)',
    good:         'rgba(34,197,94,0.8)',
    warn:         'rgba(245,158,11,0.8)',
    bad:          'rgba(239,68,68,0.8)',
    muted:        'rgba(113,113,122,0.6)'
  };

  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#71717A', font: { size: 12, family: 'Inter, sans-serif' } } }
    },
    scales: {
      x: { ticks: { color: '#52525B' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#52525B' }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  };

  function lineConfig(labels, datasets, title) {
    return {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          label: d.label,
          data: d.data,
          borderColor: i === 0 ? COLORS.primary : COLORS.accent,
          backgroundColor: i === 0 ? COLORS.primaryLight : COLORS.accentLight,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: i === 0 ? COLORS.primary : COLORS.accent,
          pointRadius: 4
        }))
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          title: title ? { display: true, text: title, color: '#E4E4E7', font: { family: 'Inter, sans-serif' } } : undefined
        },
        scales: {
          ...CHART_DEFAULTS.scales,
          y: { ...CHART_DEFAULTS.scales.y, min: 0, max: 5 }
        }
      }
    };
  }

  function barConfig(labels, data, label, color) {
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: label || '',
          data,
          backgroundColor: color || COLORS.accent,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { legend: { display: false } }
      }
    };
  }

  function doughnutConfig(labels, data) {
    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: [COLORS.bad, COLORS.warn, COLORS.muted, COLORS.good, COLORS.primary],
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } }
        }
      }
    };
  }

  // Heatmap de actividad (CSS grid puro, sin Chart.js)
  function heatmapGrid(sessions) {
    const byDay = {};
    let maxMin = 0;
    sessions.forEach(se => {
      const d = se.datetime.slice(0, 10);
      byDay[d] = (byDay[d] || 0) + se.durationMin;
      if (byDay[d] > maxMin) maxMin = byDay[d];
    });

    const today = new Date();
    const cells = [];
    for (let i = 51 * 7; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const min = byDay[key] || 0;
      const intensity = maxMin > 0 ? (min / maxMin) : 0;
      const label = `${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}: ${min} min`;
      cells.push(`<div class="hm-cell ${min === 0 ? 'empty' : ''}" style="--i:${intensity.toFixed(2)}" title="${label}"></div>`);
    }
    return `<div class="heatmap-grid">${cells.join('')}</div>`;
  }

  return { create, destroyAll, destroy, lineConfig, barConfig, doughnutConfig, heatmapGrid, COLORS };
})();
