/**
 * Script para listar usuarios de prueba de Mercado Pago
 * 
 * Uso:
 *   node scripts/list-mp-test-users.js
 */

require('dotenv').config();

const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN_TEST || process.env.MERCADOPAGO_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
    console.error('❌ Error: MERCADOPAGO_ACCESS_TOKEN_TEST no configurado en .env');
    process.exit(1);
}

async function listTestUsers() {
    try {
        // Obtener información del usuario actual (vendedor)
        console.log('🔍 Obteniendo información del usuario vendedor...\n');
        
        const meResponse = await fetch('https://api.mercadopago.com/users/me', {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
            },
        });

        if (!meResponse.ok) {
            throw new Error(`Error ${meResponse.status}`);
        }

        const meData = await meResponse.json();
        
        console.log('👤 Usuario VENDEDOR (tu aplicación):');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📧 Email: ${meData.email || 'No disponible'}`);
        console.log(`🆔 ID: ${meData.id || 'No disponible'}`);
        console.log(`👤 Nickname: ${meData.nickname || 'No disponible'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        console.log('💡 Para obtener el email del usuario COMPRADOR de prueba:');
        console.log('   1. Ve al panel de MP → Tu aplicación → Cuentas de prueba');
        console.log('   2. Copia el ID del usuario COMPRADOR');
        console.log(`   3. Ejecuta: node scripts/get-mp-test-user-email.js USER_ID\n`);
        
        console.log('📝 O usa el formato estándar:');
        console.log(`   test_user_${meData.id}@testuser.com\n`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

listTestUsers();
