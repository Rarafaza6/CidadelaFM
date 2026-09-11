const admin = require('firebase-admin');

const email = process.argv[2] || 'rafaelcarvalhodiogo@gmail.com';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Define GOOGLE_APPLICATION_CREDENTIALS com o caminho para a chave privada da conta de serviço.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

async function promoteUser() {
  const user = await admin.auth().getUserByEmail(email);
  const existingClaims = user.customClaims || {};

  await admin.auth().setCustomUserClaims(user.uid, {
    ...existingClaims,
    admin: true
  });

  const firestore = admin.firestore();
  const adminsRef = firestore.collection('adminConfig').doc('admins');
  const adminsSnapshot = await adminsRef.get();
  const existingEmails = adminsSnapshot.exists && Array.isArray(adminsSnapshot.data().emails)
    ? adminsSnapshot.data().emails
    : [];
  const emails = [...new Set([...existingEmails, user.email.toLowerCase()])];
  await adminsRef.set({ emails, updatedAt: Date.now() }, { merge: true });

  console.log(`Admin autorizado: ${user.email} (${user.uid}).`);
  console.log('O utilizador deve sair e voltar a entrar para receber o novo token.');
}

promoteUser().catch(error => {
  console.error('Não foi possível atribuir o claim admin:', error.message);
  process.exitCode = 1;
});
