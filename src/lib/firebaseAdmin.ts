import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const missingVars: string[] = [];
if (!projectId) missingVars.push('FIREBASE_PROJECT_ID');
if (!clientEmail) missingVars.push('FIREBASE_CLIENT_EMAIL');
if (!privateKey) missingVars.push('FIREBASE_PRIVATE_KEY');

if (missingVars.length > 0) {
  console.error(
    `❌ [FirebaseAdmin] Variables de entorno faltantes: ${missingVars.join(', ')}`
  );
  console.error(
    '   Crea un archivo .env en la carpeta "back" con las siguientes variables:'
  );
  console.error('   FIREBASE_PROJECT_ID=tu-project-id');
  console.error('   FIREBASE_CLIENT_EMAIL=tu-service-account@tu-project.iam.gserviceaccount.com');
  console.error('   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
}

if (!admin.apps.length && projectId && clientEmail && privateKey) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  } catch (error) {
    console.error('❌ [FirebaseAdmin] Error al inicializar Firebase Admin:', error);
  }
}

export const firebaseAdminApp = admin.apps.length ? admin.app() : undefined;
export const firebaseAdminAuth = firebaseAdminApp ? admin.auth(firebaseAdminApp) : undefined;

