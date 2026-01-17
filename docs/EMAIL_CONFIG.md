# Configuración de Email

Para que el servicio de email funcione correctamente, necesitas configurar las siguientes variables de entorno en tu archivo `.env`:

## Variables Requeridas

```env
# Configuración SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASSWORD=tu-contraseña-de-aplicacion
SMTP_FROM=tu-email@gmail.com
SMTP_FROM_NAME=MaxShop
```

## Configuración para Gmail

Si usas Gmail, necesitas:

1. **Habilitar la verificación en 2 pasos** en tu cuenta de Google
2. **Generar una contraseña de aplicación**:
   - Ve a: https://myaccount.google.com/apppasswords
   - Selecciona "Correo" y "Otro (nombre personalizado)"
   - Ingresa "MaxShop" como nombre
   - Copia la contraseña generada y úsala en `SMTP_PASSWORD`

## Configuración para otros proveedores

### Outlook/Hotmail
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
```

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=tu-api-key-de-sendgrid
```

### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=tu-usuario-mailgun
SMTP_PASSWORD=tu-contraseña-mailgun
```

## Nota

Si las variables de entorno no están configuradas, el servicio mostrará una advertencia pero **no interrumpirá el flujo**. Los pedidos se crearán correctamente, pero no se enviarán emails.

