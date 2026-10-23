const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const auth = admin.auth();
const firestore = admin.firestore();
const region = functions.region('europe-west1');

const RATE_LIMIT = {
  WINDOW_MS: 60000,
  MAX_REQUESTS: 20
};

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

function validEmail(email) {
  return typeof email === 'string' && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email) && email.length <= 320;
}

function validName(name) {
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 80;
}

function sanitizeText(value, maxLength) {
  const str = String(value || '').trim();
  // Remove potential injection characters
  return str.replace(/[<>\"']/g, '').slice(0, maxLength);
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

async function checkRateLimit(uid) {
  const key = `ratelimit:${uid}`;
  const ref = firestore.doc(`_rateLimits/${key}`);
  const doc = await ref.get();
  const now = Date.now();
  if (doc.exists) {
    const data = doc.data();
    if (now - data.windowStart < RATE_LIMIT.WINDOW_MS) {
      if (data.count >= RATE_LIMIT.MAX_REQUESTS) {
        return false;
      }
      await ref.update({ count: data.count + 1 });
    } else {
      await ref.set({ windowStart: now, count: 1 });
    }
  } else {
    await ref.set({ windowStart: now, count: 1 });
  }
  return true;
}

async function logAudit(uid, action, details, severity = 'info') {
  try {
    await firestore.collection('auditLog').add({
      action,
      details: String(details || ''),
      severity,
      timestamp: Date.now(),
      uid,
      url: null
    });
  } catch (_) {}
}

function buildAdminHttpHandler(actionName, executor) {
  return region.https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflight(req, res)) return;

    try {
      const decoded = await requireAdminFromToken(req);
      const allowed = await checkRateLimit(decoded.uid);
      if (!allowed) {
        await logAudit(decoded.uid, 'rate_limit_exceeded', 'Too many requests', 'warning');
        throw new functions.https.HttpsError('resource-exhausted', 'Limite de requisições excedido. Tenta novamente mais tarde.');
      }
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await executor(payload, decoded);
      await logAudit(decoded.uid, actionName, JSON.stringify(payload).slice(0, 500), 'info');
      res.status(200).json({ data: result });
    } catch (error) {
      await logAudit('unknown', 'handler_error', error.message || 'Unknown error', 'error').catch(() => {});
      errorResponse(res, error);
    }
  });
}

exports.createAdminUser = buildAdminHttpHandler('createAdminUser', async (data, decoded) => {
  const name = sanitizeText(data.name, 80);
  const email = sanitizeText(data.email, 160).toLowerCase();
  const password = data.password;
  if (!validName(name) || !validEmail(email) || !validPassword(password)) {
    throw new functions.https.HttpsError('invalid-argument', 'Indica nome válido, email institucional e palavra-passe com 8-128 caracteres.');
  }

  const emailAllowed = email.endsWith('@testes-cidadela.firebaseapp.com') || email.includes('cidadela');
  if (!emailAllowed) {
    throw new functions.https.HttpsError('invalid-argument', 'Email deve ser institucional (cidadela).');
  }

  const existingUsers = await auth.listUsers(1000);
  if (existingUsers.users.some(u => u.email && u.email.toLowerCase() === email)) {
    throw new functions.https.HttpsError('already-exists', 'Este email já está registado.');
  }

  const user = await auth.createUser({ email, password, displayName: name, disabled: false });
  const profile = {
    id: user.uid, authUid: user.uid, name, email,
    role: 'Administrador', roleKey: 'super_admin', roleTitle: 'Super Administrador',
    status: 'active', avatarColor: 'indigo', position: 'Membro da Equipa',
    permissions: {
      access_aovivo: true, manage_rundowns: true, manage_songs: true,
      manage_podcasts: true, manage_announcements: true, manage_links: true,
      manage_messages: true, manage_polls: true, manage_calendar: true,
      manage_tasks: true, manage_memos: true, manage_users: true, system_config: true
    },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  await firestore.collection('adminUsers').doc(user.uid).set(profile);
  await logAudit(decoded.uid, 'create_admin_user', `Criado: ${name} (${email})`, 'info');
  return { user: profile };
});

exports.updateAdminUser = buildAdminHttpHandler('updateAdminUser', async (data, decoded) => {
  const userId = sanitizeText(data.userId, 128);
  const name = sanitizeText(data.name, 80);
  const email = data.email ? sanitizeText(data.email, 160).toLowerCase() : null;
  const password = data.password;

  if (!userId || !validName(name) || (email && !validEmail(email)) || (password && !validPassword(password))) {
    throw new functions.https.HttpsError('invalid-argument', 'Confirma o nome, email válido e, se necessário, palavra-passe com 8-128 caracteres.');
  }

  const targetUser = await auth.getUser(userId).catch(() => null);
  if (!targetUser) {
    throw new functions.https.HttpsError('not-found', 'Utilizador não encontrado.');
  }

  if (decoded.uid !== userId) {
    const currentUserDoc = await firestore.collection('adminUsers').doc(decoded.uid).get();
    const currentUserRole = currentUserDoc.exists ? currentUserDoc.data().permissions : {};
    if (!currentUserRole || currentUserRole.manage_users !== true) {
      throw new functions.https.HttpsError('permission-denied', 'Não tens permissão para gerir outros utilizadores.');
    }
  }

  const update = { displayName: name };
  if (email) update.email = email;
  if (password) update.password = password;
  await auth.updateUser(userId, update);
  const profile = { id: userId, authUid: userId, name, email: email || targetUser.email, role: 'Administrador', updatedAt: Date.now() };
  await firestore.collection('adminUsers').doc(userId).set(profile, { merge: true });
  await logAudit(decoded.uid, 'update_admin_user', `Atualizado: ${name} (${userId})`, 'info');
  return { user: profile };
});

exports.deleteAdminUser = buildAdminHttpHandler('deleteAdminUser', async (data, decoded) => {
  const userId = sanitizeText(data.userId, 128);
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'Utilizador inválido.');
  }
  if (decoded.uid === userId) {
    throw new functions.https.HttpsError('failed-precondition', 'Não podes eliminar a conta que está a usar o painel.');
  }

  const allUsers = await auth.listUsers(1000);
  const target = allUsers.users.find(u => u.uid === userId);
  if (!target) {
    throw new functions.https.HttpsError('not-found', 'Utilizador não encontrado.');
  }

  const adminUsers = await firestore.collection('adminUsers').get();
  const activeAdmins = adminUsers.docs.filter(d => d.data().status !== 'suspended').length;
  if (activeAdmins <= 1) {
    throw new functions.https.HttpsError('failed-precondition', 'Não podes eliminar o último administrador.');
  }

  await auth.deleteUser(userId);
  await firestore.collection('adminUsers').doc(userId).delete();
  await logAudit(decoded.uid, 'delete_admin_user', `Eliminado: ${target.email || userId}`, 'warning');
  return { deleted: true };
});