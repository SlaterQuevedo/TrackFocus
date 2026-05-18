# TrackFocus — Setup de la nube (Supabase + Google OAuth)

Sigue estos pasos para activar la sincronización en la nube. **No requiere instalar nada localmente.**

---

## 1. Crear proyecto en Supabase

1. Entra a https://supabase.com → **Sign in** con GitHub
2. **New Project** → asigna nombre `trackfocus`, contraseña fuerte de DB (guárdala), región más cercana
3. Espera ~2 minutos a que el proyecto se aprovisione

---

## 2. Cargar el esquema de base de datos

1. En el dashboard de Supabase: menú lateral → **SQL Editor** → **+ New query**
2. Abre el archivo `supabase/schema.sql` de este repo
3. Copia TODO su contenido y pégalo en el editor
4. Clic en **Run** (esquina inferior derecha)
5. Debe terminar sin errores. Verifica en **Table Editor** que aparezcan: `users`, `schools`, `classrooms`, `study_sessions`, `custom_subjects`, `classroom_requests`

---

## 3. Configurar Google OAuth en Google Cloud Console

1. Ve a https://console.cloud.google.com → crea un proyecto nuevo (o usa uno existente)
2. Menú lateral → **APIs & Services → OAuth consent screen**
   - User type: **External** → **Create**
   - App name: `TrackFocus`
   - User support email: tu email
   - Developer contact: tu email
   - **Save and continue** en todas las secciones siguientes
   - En "Test users" puedes saltarlo o agregar tu email
3. Menú lateral → **APIs & Services → Credentials → + Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `TrackFocus Web`
   - **Authorized redirect URIs** → **+ Add URI** y pega:
     ```
     https://TU_REFERENCIA.supabase.co/auth/v1/callback
     ```
     (Reemplaza `TU_REFERENCIA` con el "Project Reference ID" que aparece en Supabase → Settings → General → Reference ID)
4. Clic en **Create** → copia el **Client ID** y **Client Secret**

---

## 4. Activar Google en Supabase Auth

1. Supabase Dashboard → **Authentication → Providers**
2. Busca **Google** → toggle a **Enabled**
3. Pega el **Client ID** y **Client Secret** del paso anterior
4. **Save**

---

## 5. Configurar URLs de redirección

1. Supabase Dashboard → **Authentication → URL Configuration**
2. **Site URL**: pon tu URL de Vercel, p. ej. `https://track-focus.vercel.app`
3. **Redirect URLs**: agrega (uno por línea):
   ```
   https://track-focus.vercel.app/**
   http://localhost:3000/**
   ```
4. **Save**

---

## 6. Pegar credenciales en el código

1. Abre Supabase → **Settings → API**
2. Copia:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon / public key** (la `anon` — NO la `service_role`)
3. Abre el archivo `TrackFocus-claude-study-concentration-tracker-FegXg/js/supabase-config.js`
4. Reemplaza los placeholders por tus valores reales
5. Guarda y commit el cambio a tu repo

⚠️ La `anon key` es pública y está diseñada para ir en el frontend. La `service_role` NUNCA debe estar en el frontend.

---

## 7. Re-deploy en Vercel

Si subiste los cambios a GitHub, Vercel hace re-deploy automático. Si no, sube los archivos manualmente como hiciste antes.

---

## 8. Probar

1. Abre tu URL de producción (`https://track-focus.vercel.app`)
2. Clic en cualquier tarjeta de rol → **Continuar con Google**
3. Autoriza con tu cuenta de Google
4. Vuelve al sitio → ya estás logueado con tu perfil

**Para probar multi-dispositivo:** abre la misma URL en otro navegador/dispositivo, inicia sesión con Google, verás los mismos datos.

---

## Seguridad: políticas RLS (ya endurecidas)

El `schema.sql` ya incluye Row-Level Security estricta:

| Tabla | Quién puede leer | Quién puede escribir |
|---|---|---|
| `users` | propio + compañeros del aula + docentes del mismo colegio + super_admin | propio + docentes del colegio + super_admin |
| `schools` | todos los autenticados (para validar códigos) | docentes + super_admin |
| `classrooms` | todos los autenticados (para validar invite codes) | docentes del colegio + super_admin |
| `study_sessions` | propias + docentes (sesiones de su aula/colegio) + super_admin | propias + super_admin |
| `custom_subjects` | propias + super_admin | propias + super_admin |
| `classroom_requests` | propias + docentes del colegio + super_admin | propias (crear) / docentes (aprobar) + super_admin |

> Un estudiante NO puede ver las sesiones, materias o solicitudes de otro estudiante. La RLS lo bloquea a nivel de base de datos.

## Promover al primer super_admin

Como la RLS no permite que un usuario se auto-promueva a super_admin por la app (medida de seguridad), debes hacerlo manualmente la primera vez:

1. Inicia sesión con Google en TrackFocus (entrarás como estudiante)
2. Ve a **Supabase Dashboard → SQL Editor → New query**
3. Ejecuta (reemplaza el email):
   ```sql
   update public.users set role = 'super_admin' where id = 'tu-email@gmail.com';
   ```
4. Recarga TrackFocus. Ahora verás el panel de administrador.

Desde el panel admin puedes promover docentes editando su rol desde Supabase, o usar el flujo de promoción en la app (Soy Docente + código de colegio).

---

## Diagnóstico de errores comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| "Invalid login credentials" tras Google | Redirect URL mal | Verifica paso 5 — la URL de Vercel debe estar en Redirect URLs |
| Click en Google y no pasa nada | `supabase-config.js` con placeholders | Paso 6 — pega URL + anon key reales |
| Login OK pero no carga datos | RLS bloqueando | Revisa que en SQL Editor se hayan creado las políticas (paso 2) |
| "User already registered" | Trigger duplicado | Re-ejecuta el bloque `drop trigger ... create trigger` del schema |
