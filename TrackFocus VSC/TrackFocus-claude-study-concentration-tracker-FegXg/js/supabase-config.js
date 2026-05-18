// ============================================================
// CONFIGURACIÓN DE SUPABASE — Pega aquí los valores de TU proyecto.
//
//   1. Entra a https://supabase.com/dashboard
//   2. Selecciona tu proyecto TrackFocus
//   3. Menú lateral → Settings → API
//   4. Copia "Project URL" y "anon public" key
//   5. Pégalos abajo y guarda
//
// La "anon key" es PÚBLICA por diseño (la seguridad real está en las políticas RLS).
// NUNCA pegues la "service_role" key aquí — esa es secreta y va sólo en servidor.
// ============================================================

const SUPABASE_CONFIG = {
  url:     'https://sgzhxswdgkehlsrflnnz.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnemh4c3dkZ2tlaGxzcmZsbm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDE5NjYsImV4cCI6MjA5NDYxNzk2Nn0.SeXgLom6n3k0LxbtOS0KtZ1BGiR_l-BVBA1Nwj606ro'
};

// ---------- No editar abajo ----------

function _isConfigured(cfg) {
  return cfg.url.startsWith('https://')
      && !cfg.url.includes('YOUR_PROJECT_REF')
      && cfg.anonKey
      && cfg.anonKey.length > 30
      && !cfg.anonKey.includes('YOUR_ANON');
}

const _ready = _isConfigured(SUPABASE_CONFIG);

window.SB = _ready
  ? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

window.SB_READY = _ready;

if (!_ready) {
  console.warn(
    '[TrackFocus] Supabase NO está configurado.\n' +
    '  Edita js/supabase-config.js con tu URL y anon key.\n' +
    '  Sigue las instrucciones de SETUP.md.'
  );
}
