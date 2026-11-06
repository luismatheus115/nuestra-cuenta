# NUESTRA CUENTA — guía paso a paso (Fase 1)

## 1. Crear la base de datos (gratis)
1. Entra en https://supabase.com, crea cuenta y pulsa "New project" (nombre: nuestra-cuenta, elige región Europa, apunta la contraseña).
2. Menú izquierdo "SQL Editor" > "New query". Pega TODO el contenido de `supabase/schema.sql` y pulsa "Run". Debe decir "Success".
3. "Project Settings" > "API": copia "Project URL" y la clave "anon public". (NUNCA uses la clave service_role.)
4. "Authentication" > "URL Configuration": en "Site URL" pon la dirección web final de la app (paso 2).

## 2. Publicar la app (gratis)
1. Sube esta carpeta a un repositorio de GitHub (sin node_modules).
2. En https://vercel.com "Add New Project", elige el repositorio.
3. En "Environment Variables" añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del paso 1.3 y pulsa "Deploy". Vercel da una dirección https://...vercel.app.

## 3. Primer uso
Luis crea su cuenta (nombre "Luis") > "Crear espacio nuevo" > copia el código. Yelifer crea su cuenta (nombre "Yelifer") > "Unirme" con el código.

## 4. Instalar
- Samsung: Chrome > abrir la dirección > menú ⋮ > "Instalar aplicación".
- iPhone: Safari > abrir la dirección > Compartir > "Añadir a pantalla de inicio".

## Desarrollo local
`npm install`, copiar `.env.example` a `.env` con tus valores, `npm run dev`.

## Módulo Agentes (ampliación)
Ejecuta también `supabase/agentes.sql` en el SQL Editor de Supabase.
