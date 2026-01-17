# 🔍 Verificar Configuración de Brevo

## Problema

Si ves este mensaje al iniciar el servidor:
```
⚠️ [BrevoClient] BREVO_API_KEY no configurada. Los emails no se enviarán.
```

Significa que las variables de entorno no están configuradas correctamente.

## ✅ Solución

### 1. Verificar que el archivo `.env` existe

Asegúrate de tener un archivo `.env` en la raíz de `api/`:

```
api/
├── .env          ← Debe existir aquí
├── src/
├── package.json
└── ...
```

### 2. Agregar las variables de Brevo

Abre el archivo `.env` y agrega estas líneas:

```env
# Configuración Brevo
BREVO_API_KEY=tu_api_key_aqui
BREVO_SENDER_EMAIL=appmaxshop2025@gmail.com
BREVO_SENDER_NAME=MaxShop
```

**Importante:**
- No dejes espacios alrededor del `=`
- No uses comillas alrededor de los valores
- Reemplaza `tu_api_key_aqui` con tu API Key real de Brevo

### 3. Verificar que las variables se carguen

Después de agregar las variables:

1. **Reinicia el servidor** completamente (Ctrl+C y luego `npm run dev`)
2. **Busca estos mensajes** al iniciar:

   ✅ **Si está configurado correctamente:**
   ```
   ✅ [BrevoClient] Cliente configurado correctamente
      📧 Remitente: MaxShop <appmaxshop2025@gmail.com>
   ```

   ⚠️ **Si NO está configurado:**
   ```
   ⚠️ [BrevoClient] BREVO_API_KEY no configurada. Los emails no se enviarán.
   ```

### 4. Verificar que dotenv carga el archivo

Si ves este mensaje:
```
[dotenv@17.2.3] injecting env (0) from .env
```

El `(0)` significa que cargó **0 variables**. Esto puede significar:
- El archivo `.env` no existe
- El archivo `.env` está vacío
- El archivo `.env` está en la ubicación incorrecta

### 5. Ubicación correcta del .env

El archivo `.env` debe estar en:
```
api/.env    ← Aquí (mismo nivel que package.json)
```

**NO** en:
```
api/src/.env    ← ❌ Incorrecto
api/dist/.env   ← ❌ Incorrecto
```

## 🔧 Debugging

### Verificar que las variables se cargan

Puedes agregar temporalmente esto en `src/index.ts` después de `dotenv.config()`:

```typescript
dotenv.config();

// Debug: Verificar variables (ELIMINAR después de verificar)
console.log('🔍 Debug - Variables de entorno:');
console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✅ Configurada' : '❌ No configurada');
console.log('BREVO_SENDER_EMAIL:', process.env.BREVO_SENDER_EMAIL || '❌ No configurada');
console.log('BREVO_SENDER_NAME:', process.env.BREVO_SENDER_NAME || '❌ No configurada');
```

**IMPORTANTE:** Elimina este código de debug después de verificar.

### Verificar formato del .env

El formato correcto es:
```env
BREVO_API_KEY=xkeysib-1234567890abcdef
BREVO_SENDER_EMAIL=appmaxshop2025@gmail.com
BREVO_SENDER_NAME=MaxShop
```

**Formato incorrecto:**
```env
BREVO_API_KEY = xkeysib-1234567890abcdef    ← ❌ Espacios alrededor del =
BREVO_API_KEY="xkeysib-1234567890abcdef"    ← ❌ Comillas (opcional pero no necesario)
BREVO_API_KEY=xkeysib-1234567890abcdef      ← ✅ Correcto
```

## 📝 Checklist

- [ ] Archivo `.env` existe en `api/.env`
- [ ] Variables `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` están en el `.env`
- [ ] No hay espacios alrededor del `=` en las variables
- [ ] API Key es válida (obtenida de https://app.brevo.com/)
- [ ] Email remitente está verificado en Brevo
- [ ] Servidor fue reiniciado después de agregar las variables
- [ ] Aparece el mensaje `✅ [BrevoClient] Cliente configurado correctamente`

## 🆘 Si sigue sin funcionar

1. **Verifica la ubicación del .env:**
   ```bash
   # Desde la raíz del proyecto
   ls api/.env
   ```

2. **Verifica el contenido del .env:**
   ```bash
   # Desde la raíz del proyecto
   cat api/.env | grep BREVO
   ```

3. **Reinicia completamente:**
   - Detén el servidor (Ctrl+C)
   - Espera 2 segundos
   - Inicia de nuevo (`npm run dev`)

4. **Verifica que dotenv encuentra el archivo:**
   - El mensaje `[dotenv@17.2.3] injecting env (X) from .env` debe mostrar un número mayor a 0
   - Si muestra `(0)`, el archivo no se está cargando

---

**Última actualización:** Enero 2025

