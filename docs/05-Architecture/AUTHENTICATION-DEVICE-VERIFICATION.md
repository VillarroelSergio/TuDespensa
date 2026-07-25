---
title: Autenticación con contraseña y verificación de navegador
tags:
  - midespensa
  - arquitectura
  - auth
status: in-progress
notion_task: "https://app.notion.com/p/3a8ad407cbfd81f9b17decfef02ae713"
related:
  - "[[TECHNICAL-ARCHITECTURE]]"
  - "[[ACTIVE-CONTEXT]]"
---

# Autenticación con contraseña y verificación de navegador

## Decisión

El acceso principal usa correo y contraseña. El correo se confirma al crear
la cuenta y se usa para recuperación. Después de una contraseña válida, un
navegador sin reconocer debe introducir un OTP enviado al correo; un navegador
reconocido no vuelve a pedirlo por la renovación ordinaria de sesión.

El token del navegador es aleatorio, opaco, `HttpOnly`, `Secure` en producción,
con `SameSite=Lax`, y dura 30 días. PostgreSQL conserva exclusivamente su hash
SHA-256 y permite revocación futura. El navegador se comprueba en middleware
antes de abrir una ruta privada.

## Límites de seguridad

Este paso es una verificación de dispositivo de MiDespensa. Supabase Auth no
considera el correo un factor MFA nativo ni eleva a AAL2. TOTP es el siguiente
incremento si se requiere MFA criptográficamente exigible en RLS. No se deben
usar los metadatos editables del usuario para autorización.

## Operación necesaria antes de producción

1. Activar confirmación de correo y contraseña en Supabase Auth.
2. Configurar SMTP propio y dominio remitente.
3. Cambiar la plantilla OTP de correo para que muestre `{{ .Token }}` en vez de
   depender solo de un enlace mágico.
4. Registrar las URL de callback de producción, preview y local.
5. Configurar requisitos de contraseña y revisar límites de envío de correo.

## Estado de verificación

La implementación se realizó a petición expresa sin ejecutar pruebas locales ni
E2E. Antes de desplegar deben cubrirse el inicio conocido/nuevo, código vencido,
recuperación, invitación, revocación y el aislamiento RLS de dos sesiones.
