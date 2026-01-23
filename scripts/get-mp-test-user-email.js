/**
 * Script para obtener el email del usuario de prueba de Mercado Pago
 * 
 * Uso:
 *   node scripts/get-mp-test-user-email.js
 * 
 * Requiere:
 *   - MERCADOPAGO_ACCESS_TOKEN_TEST en .env
 *   - O pasar el USER_ID como argumento: node scripts/get-mp-test-user-email.js USER_ID
 */

require('dotenv').config();

const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN_TEST || process.env.MERCADOPAGO_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
    console.error('❌ Error: MERCADOPAGO_ACCESS_TOKEN_TEST no configurado en .env');
    process.exit(1);
}

// Obtener USER_ID del argumento o buscar usuarios de prueba
const USER_ID = process.argv[2];

async function getTestUserEmail(userId) {
    try {
        const url = userId 
            ? `https://api.mercadopago.com/users/${userId}`
            : 'https://api.mercadopago.com/users/me';
        
        console.log(`🔍 Consultando: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Error ${response.status}: ${JSON.stringify(error)}`);
        }

        const data = await response.json();
        
        console.log('\n✅ Usuario encontrado:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📧 Email: ${data.email || 'No disponible'}`);
        console.log(`🆔 ID: ${data.id || 'No disponible'}`);
        console.log(`👤 Nombre: ${data.nickname || data.first_name || 'No disponible'}`);
        console.log(`📊 Site ID: ${data.site_id || 'No disponible'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (data.email) {
            console.log('\n💡 Agrega esto a tu .env:');
            console.log(`MERCADOPAGO_TEST_USER_EMAIL=${data.email}\n`);
        } else {
            console.log('\n⚠️  No se encontró email. El formato estándar es:');
            console.log(`test_user_${data.id}@testuser.com\n`);
        }
        
        return data.email || `test_user_${data.id}@testuser.com`;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        if (error.message.includes('401')) {
            console.error('\n💡 Verifica que MERCADOPAGO_ACCESS_TOKEN_TEST sea correcto');
        }
        
        process.exit(1);
    }
}

// Si no se pasó USER_ID, intentar obtener el usuario actual
if (!USER_ID) {
    console.log('ℹ️  No se especificó USER_ID. Obteniendo información del usuario actual...\n');
}

getTestUserEmail(USER_ID);
