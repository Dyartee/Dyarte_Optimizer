/**
 * DYARTE OPTIMIZER - Admin Bootstrap Script
 * Promove com segurança um usuário a Administrador via Firebase Admin SDK.
 * Atribui Custom Claims ({ admin: true, role: 'ADMIN' }) e registra na coleção admins/{uid}.
 * 
 * Uso:
 *   npx tsx scripts/bootstrap-admin.ts <email-ou-uid>
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, UserRecord } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function bootstrapAdmin() {
  const targetIdentifier = process.argv[2];

  if (!targetIdentifier) {
    console.error('Uso: npx tsx scripts/bootstrap-admin.ts <email-ou-uid>');
    process.exit(1);
  }

  // Inicializa Firebase Admin se ainda não inicializado
  if (!getApps().length) {
    const projectId = firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID || 'global-mark-xpthm';
    initializeApp({
      projectId,
    });
  }

  const auth = getAuth();
  const db = getFirestore(undefined, firebaseConfig.firestoreDatabaseId);

  try {
    let userRecord: UserRecord;

    if (targetIdentifier.includes('@')) {
      console.log(`Buscando usuário por e-mail: ${targetIdentifier}...`);
      userRecord = await auth.getUserByEmail(targetIdentifier.toLowerCase());
    } else {
      console.log(`Buscando usuário por UID: ${targetIdentifier}...`);
      userRecord = await auth.getUser(targetIdentifier);
    }

    if (!userRecord.emailVerified) {
      console.warn(`AVISO: O e-mail deste usuário (${userRecord.email}) ainda não foi verificado.`);
      console.log('Marcando email_verified como true para habilitação administrativa...');
      await auth.updateUser(userRecord.uid, { emailVerified: true });
    }

    // 1. Atribuir Custom Claims com admin: true e role: 'ADMIN'
    console.log(`Atribuindo Custom Claims de Administrador ao UID: ${userRecord.uid}...`);
    await auth.setCustomUserClaims(userRecord.uid, {
      admin: true,
      role: 'ADMIN',
    });

    // 2. Atualizar documento na coleção 'users'
    const userDocRef = db.collection('users').doc(userRecord.uid);
    await userDocRef.set(
      {
        role: 'ADMIN',
        plano_atual: 'COMPLETO',
        nivel_plano: 4,
        status_plano: 'ATIVO',
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 3. Registrar na coleção restrita 'admins'
    const adminDocRef = db.collection('admins').doc(userRecord.uid);
    await adminDocRef.set({
      user_id: userRecord.uid,
      email: userRecord.email,
      role: 'ADMIN',
      status: 'ACTIVE',
      granted_at: new Date().toISOString(),
      granted_by: 'cli_bootstrap',
    });

    console.log('====================================================');
    console.log('SUCESSO: Usuário promovido a Administrador Master!');
    console.log(`UID: ${userRecord.uid}`);
    console.log(`E-mail: ${userRecord.email}`);
    console.log('Custom claims: { admin: true, role: "ADMIN" }');
    console.log('Coleção admins: Registrado');
    console.log('====================================================');
  } catch (error: any) {
    console.error('Falha ao promover usuário a administrador:', error.message || error);
    process.exit(1);
  }
}

bootstrapAdmin();
