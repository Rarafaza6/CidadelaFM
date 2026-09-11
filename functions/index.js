const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const auth = admin.auth();
const firestore = admin.firestore();
const region = functions.region('europe-west1');

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || req.headers.referer || '*';
  res.setHeader('Access-Control-Allow-Origin', origin === '*' ? '*' : origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '3600');
}

function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.status(204).send('');
    return true;
  }
  return false;
}

async function requireAdminFromToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    throw new functions.https.HttpsError('unauthenticated', 'É necessária uma sessão de administrador.');
  }

  const decoded = await auth.verifyIdToken(token);
  if (!decoded || !decoded.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'É necessária uma sessão de administrador.');
  }

  return decoded;
}

function errorResponse(res, error) {
  const statusCode = error && error.code === 'unauthenticated' ? 401
    : error && error.code === 'invalid-argument' ? 400
    : error && error.code === 'failed-precondition' ? 412
    : 500;

  res.status(statusCode).json({
    error: error && error.message ? error.message : 'Não foi possível concluir a operação.'
  });
}

function buildAdminHttpHandler(executor) {
  return region.https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflight(req, res)) return;

    try {
      const decoded = await requireAdminFromToken(req);
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await executor(payload, decoded);
      res.status(200).json({ data: result });
    } catch (error) {
      errorResponse(res, error);
    }
  });
}

exports.createAdminUser = buildAdminHttpHandler(async (data, decoded) => {
  const name = cleanText(data.name, 80);
  const email = cleanText(data.email, 160).toLowerCase();
  const password = data.password;
  if (!name || !email || !validPassword(password)) {
    throw new functions.https.HttpsError('invalid-argument', 'Indica nome, email válido e uma palavra-passe com pelo menos 8 caracteres.');
  }

  const user = await auth.createUser({ email, password, displayName: name });
  const profile = { id: user.uid, authUid: user.uid, name, email, role: 'Administrador', createdAt: Date.now(), updatedAt: Date.now() };
  await firestore.collection('adminUsers').doc(user.uid).set(profile);
  return { user: profile };
});

exports.updateAdminUser = buildAdminHttpHandler(async (data, decoded) => {
  const userId = cleanText(data.userId, 128);
  const name = cleanText(data.name, 80);
  const email = cleanText(data.email, 160).toLowerCase();
  const password = data.password;

  if (!userId || !name || !email || (password && !validPassword(password))) {
    throw new functions.https.HttpsError('invalid-argument', 'Confirma o nome, email e, se necessário, uma palavra-passe com pelo menos 8 caracteres.');
  }

  const update = { email, displayName: name };
  if (password) update.password = password;
  await auth.updateUser(userId, update);
  const profile = { id: userId, authUid: userId, name, email, role: 'Administrador', updatedAt: Date.now() };
  await firestore.collection('adminUsers').doc(userId).set(profile, { merge: true });
  return { user: profile };
});

exports.deleteAdminUser = buildAdminHttpHandler(async (data, decoded) => {
  const userId = cleanText(data.userId, 128);
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'Utilizador inválido.');
  }
  if (decoded.uid === userId) {
    throw new functions.https.HttpsError('failed-precondition', 'Não podes eliminar a conta que está a usar o painel.');
  }

  await auth.deleteUser(userId);
  await firestore.collection('adminUsers').doc(userId).delete();
  return { deleted: true };
});