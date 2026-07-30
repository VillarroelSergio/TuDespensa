<p align="center">
  <img src="https://img.shields.io/badge/versión-1.0.0-a34a28?style=flat-square" alt="Versión 1.0.0" />
  <img src="https://img.shields.io/badge/licencia-MIT-a34a28?style=flat-square" alt="Licencia MIT" />
  <img src="https://github.com/VillarroelSergio/TuDespensa/actions/workflows/ci.yml/badge.svg" alt="Estado de la CI" />
  <img src="https://img.shields.io/badge/Node-24.x-a34a28?style=flat-square" alt="Node 24.x" />
</p>

# 🍲 MiDespensa

**MiDespensa** ayuda a un hogar a decidir qué cocinar, aprovechar lo que ya tiene y comprar solo lo necesario, sin convertir la organización doméstica en otra tarea pesada.

Es una PWA (aplicación web instalable en el móvil) construida como monolito modular con **Next.js + Supabase**, pensada para un único hogar de hasta dos cuentas — no es un producto multiusuario ni de registro público. Visión completa del producto en [`docs/01-Product/PRODUCT-BRIEF.md`](docs/01-Product/PRODUCT-BRIEF.md).

## Índice

- [¿Qué resuelve?](#qué-resuelve)
- [Funcionalidades](#funcionalidades)
- [Stack técnico](#stack-técnico)
- [Puesta en marcha](#puesta-en-marcha)
- [Desarrollo local continuo](#desarrollo-local-continuo)
- [Pruebas desde el móvil](#pruebas-desde-el-móvil)
- [Verificación y pruebas](#verificación-y-pruebas)
- [Scripts disponibles](#scripts-disponibles)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Documentación](#documentación)
- [Estado del proyecto](#estado-del-proyecto)
- [Licencia](#licencia)

## ¿Qué resuelve?

La información necesaria para cocinar suele estar repartida entre la memoria, notas sueltas, la nevera y decisiones improvisadas. Eso provoca compras duplicadas, ingredientes que caducan sin usarse y tiempo perdido pensando qué cocinar cada día.

MiDespensa conecta recetas, plan semanal, lista de la compra y despensa en un único flujo, para que actualizar la despensa sea parte natural de comprar y cocinar, no una tarea administrativa aparte.

## Funcionalidades

- 📖 **Recetario compartido** con captura rápida por enlace, edición estructurada (ingredientes, pasos, raciones) y categorías/favoritos por persona.
- 🗓️ **Planificador semanal** de comidas y cenas, con sugerencias explicables (`Aprovecha el calabacín`, `Lista en 25 min`) que el hogar acepta o descarta.
- 🛒 **Lista de la compra consolidada** desde el plan, con alta manual y agrupación de unidades compatibles.
- 🧺 **Despensa** con tres formas de seguimiento (unidades exactas, peso/volumen o presencia aproximada) y avisos de "consumir pronto".
- 🍳 **Flujo de cocinar y consumir**, que descuenta de la despensa lo que confirmas al marcar una receta como cocinada.
- 🧾 **Captura de tickets** (texto, foto o PDF) para pasar una compra ya hecha a la despensa: todo se procesa en el navegador, sin OCR en servidor y sin subir ni guardar ninguna imagen.
- 💾 **Copia de seguridad del hogar**: instantánea JSON descargable con recetas, compra y despensa, con restauración conservadora.
- 🔒 **Acceso cerrado**: máximo dos cuentas por hogar, autenticación por enlace mágico/OTP y Row Level Security en cada tabla privada.

## Stack técnico

| Capa | Tecnología |
| --- | --- |
| Framework | [Next.js](https://nextjs.org/) (App Router) + React + TypeScript |
| Datos | [Supabase](https://supabase.com/) (PostgreSQL, Auth, Realtime, Storage) |
| Hosting | Vercel (Hobby) |
| Pruebas | Vitest (unitarias) + Playwright (E2E) |
| Calidad | ESLint, Prettier, TypeScript estricto |
| CI/CD | GitHub Actions |

Decisiones de arquitectura completas en [`docs/05-Architecture/TECHNICAL-ARCHITECTURE.md`](docs/05-Architecture/TECHNICAL-ARCHITECTURE.md) y en los [ADR](docs/adr/README.md).

## Puesta en marcha

### Requisitos

- Node.js 24 o posterior
- npm 11 o posterior
- Docker Desktop (para Supabase local)
- Supabase CLI (puede ejecutarse mediante `npx supabase`)

### Instalación

```bash
git clone https://github.com/VillarroelSergio/TuDespensa.git
cd TuDespensa
npm ci
cp .env.example .env.local
```

Completa `.env.local` únicamente con los valores del entorno local (`.env.example` documenta cada variable; nunca subas `.env.local` ni claves reales).

## Desarrollo local continuo

1. Instala las dependencias (`npm ci`, arriba).

2. Inicia los servicios locales una sola vez:

   ```bash
   npm run dev:services
   ```

   Docker queda en marcha entre sesiones. No hay que borrar ni recrear los contenedores para cada cambio de interfaz.

3. La primera vez, o cuando quieras volver al estado de datos conocido, resetea solo datos y migraciones:

   ```bash
   npm run dev:reset
   ```

4. Para revisar y modificar flujos reales, deja la web levantada con:

   ```bash
   npm run dev:auth
   ```

   Abre `http://localhost:3000/login` y escribe `admin`. La cuenta local `admin/admin` tiene un hogar y una despensa sintéticos, persiste mientras no ejecutes `dev:reset` y usa Auth, RLS y RPC reales. No existe fuera de desarrollo.

Para inspección exclusivamente visual sin persistencia, usa `npm run dev:demo`. Para apagar Docker al terminar, usa `npm run dev:stop`.

## Pruebas desde el móvil

Con el móvil y el ordenador en la misma red Wi-Fi, detén antes el servidor de Next con `Ctrl+C` y ejecuta:

```bash
npm run dev:demo:mobile
```

Abre en el móvil `http://IP-DEL-ORDENADOR:3000`. Este modo es para revisar la interfaz: no usa sesión ni persiste acciones. Si Windows pregunta, permite el acceso de Node.js en redes privadas; no abras el puerto para redes públicas.

Para probar el flujo real con `admin`, inicia `npm run dev:auth:mobile` y cambia temporalmente `NEXT_PUBLIC_SUPABASE_URL` en `.env.local` de `127.0.0.1` a la misma IP local del ordenador (puerto `55321`); después reinicia Next. Supabase local y sus claves son solo de desarrollo: nunca expongas esos puertos fuera de tu Wi-Fi privado.

## Verificación y pruebas

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:coverage
npm run test:e2e
```

La prueba E2E requiere Supabase local y valida el navegador contra el flujo real de Auth, onboarding, RLS y Realtime. Además de `npm run test:e2e` existen `test:e2e:founder`, `test:e2e:actions`, `test:e2e:realtime` (Supabase local) y `test:e2e:ux` (sin Supabase, fixtures de demo). Consulta [e2e/README.md](e2e/README.md) para la preparación, ejecución visible y artefactos de diagnóstico.

Con Supabase local iniciado, ejecuta la integración SQL después de `db reset`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:55322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/mvp_onboarding_security.sql
```

El script SQL usa datos sintéticos, termina con `ROLLBACK` y no conserva usuarios ni filas de prueba.

Cada cambio pasa por lint, comprobación de tipos, build y pruebas unitarias en GitHub Actions antes de poder fusionarse — ver [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Scripts disponibles

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo de Next.js |
| `npm run dev:auth` | Desarrollo con Supabase local y Auth real |
| `npm run dev:demo` | Desarrollo con datos de demostración (solo visual) |
| `npm run dev:services` | Arranca Docker/Supabase local una vez |
| `npm run dev:reset` | Resetea datos y migraciones locales |
| `npm run dev:stop` | Detiene los servicios locales de Supabase |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Comprobación de tipos de TypeScript |
| `npm run test` | Pruebas unitarias (Vitest) |
| `npm run test:e2e` | Pruebas E2E con Auth real |
| `npm run format` | Formatea el proyecto con Prettier |

## Estructura del proyecto

```
src/
  app/            Rutas de Next.js (App Router)
  modules/        Lógica de dominio por área (recetas, plan, compra, despensa, hogar)
  lib/            Utilidades compartidas
supabase/
  migrations/     Esquema versionado, RLS y RPCs
docs/             Documentación de producto, UX y arquitectura
e2e/              Pruebas end-to-end (Playwright)
```

## Documentación

Toda la documentación de producto y arquitectura vive en [`docs/`](docs/), organizada por fases: `00-Project` (contexto y hub), `01-Product` (visión y brief), `02-Requirements`, `03-UX`, `04-Research`, `05-Architecture` (arquitectura técnica y decisiones registradas en [`docs/adr/`](docs/adr/)).

## Estado del proyecto

MiDespensa es un proyecto personal, no comercial, en piloto privado con el hogar fundador. No está preparado para registro público ni crecimiento multiusuario — es una decisión de producto deliberada, no una limitación temporal. El repositorio es público a modo de portfolio técnico.

## Licencia

Distribuido bajo licencia [MIT](LICENSE).
