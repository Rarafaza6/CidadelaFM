/* =========================================================
   Rádio Wave — Núcleo partilhado da votação (Firebase + Contador)
   Usado por: index.html (público), equipa.html, resultados.html
   ========================================================= */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyCn04I22HdbvOFSFpxci1l_uRRepcLk5f8",
    authDomain: "cidadelafm.firebaseapp.com",
    projectId: "cidadelafm",
    storageBucket: "cidadelafm.firebasestorage.app",
    messagingSenderId: "312932696570",
    appId: "1:312932696570:web:2faf5d0036f2bb3b4fa443",
    measurementId: "G-QZ6Q7RPG9B"
  };

  // 26/out/2026 às 15:00 (hora de Portugal = UTC+0 nessa data, após o fim da hora de verão)
  var DEADLINE = Date.UTC(2026, 9, 26, 15, 0, 0);

  var db = null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  } catch (e) {
    console.error('Firebase indisponível:', e);
  }

  function docKey(str) {
    return encodeURIComponent(String(str).toLowerCase()).replace(/%/g, '~').slice(0, 200);
  }

  // Nome da equipa normalizado: sem acentos, maiúsculas nem espaços a mais
  function nameKey(name) {
    return docKey(String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim());
  }

  function requireDb() {
    if (!db) throw new Error('NO_DB');
    return db;
  }

  // Todos os dados da votação vivem em votacao_2026/wave/<coleção>
  // (isolados do resto do projeto Firebase "cidadelafm").
  function col(name) {
    return requireDb().collection('votacao_2026').doc('wave').collection(name);
  }

  function isClosed() { return Date.now() >= DEADLINE; }

  /* ---------- CONTADOR ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }

  function startCountdown(onClose) {
    var closedFired = false;
    function tick() {
      var diff = DEADLINE - Date.now();
      var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
      if (diff <= 0) {
        set('cdDays', '00'); set('cdHours', '00'); set('cdMinutes', '00'); set('cdSeconds', '00');
        var badge = document.getElementById('cdStatusBadge');
        if (badge) { badge.textContent = '🔒 Votação Encerrada'; badge.style.color = '#dc2626'; }
        if (!closedFired) { closedFired = true; if (onClose) onClose(); }
        return;
      }
      set('cdDays', pad(Math.floor(diff / 86400000)));
      set('cdHours', pad(Math.floor(diff / 3600000) % 24));
      set('cdMinutes', pad(Math.floor(diff / 60000) % 60));
      set('cdSeconds', pad(Math.floor(diff / 1000) % 60));
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- VOTO PÚBLICO ---------- */
  // Um documento por votante (ID = identificação). A transação impede votos duplicados.
  function submitPublicVote(ballot, suggestionText) {
    var d = requireDb();
    var ref = col('public_votes').doc(docKey(ballot.voterKey));
    return d.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        if (snap.exists) throw new Error('DUPLICATE');
        tx.set(ref, ballot);
      });
    }).then(function () {
      if (suggestionText) {
        return col('suggestions').add({
          author: ballot.auditLabel,
          text: suggestionText,
          timestamp: ballot.timestamp,
          dateStr: ballot.dateStr
        });
      }
    });
  }

  /* ---------- VOTO DA EQUIPA (SECRETO) ---------- */
  // members_voted: quem participou (sem escolha). secret_ballots: escolha (sem nome nem hora).
  function submitTeamVote(name, ranking) {
    var d = requireDb();
    var memberRef = col('team_members_voted').doc(nameKey(name));
    var ballotRef = col('team_secret_ballots').doc();
    return d.runTransaction(function (tx) {
      return tx.get(memberRef).then(function (snap) {
        if (snap.exists) throw new Error('DUPLICATE');
        tx.set(memberRef, { name: name, timestamp: Date.now(), dateStr: new Date().toLocaleString('pt-PT') });
        tx.set(ballotRef, { ranking: ranking });
      });
    });
  }

  function hasTeamMemberVoted(name) {
    return col('team_members_voted').doc(nameKey(name)).get()
      .then(function (s) { return s.exists; });
  }

  /* ---------- LEITURA EM TEMPO REAL (RESULTADOS) ---------- */
  function listen(name, cb, onErr) {
    return col(name).onSnapshot(function (snap) {
      cb(snap.docs.map(function (x) { var o = x.data(); o._docId = x.id; return o; }));
    }, function (err) { console.error(name, err); if (onErr) onErr(err); });
  }

  function removeDoc(name, id) { return col(name).doc(id).delete(); }

  function logDeletion(entry) {
    entry.timestamp = Date.now();
    entry.dateStr = new Date().toLocaleString('pt-PT');
    return col('deletion_log').add(entry);
  }

  window.WaveCore = {
    DEADLINE: DEADLINE,
    hasDb: function () { return !!db; },
    isClosed: isClosed,
    startCountdown: startCountdown,
    submitPublicVote: submitPublicVote,
    submitTeamVote: submitTeamVote,
    hasTeamMemberVoted: hasTeamMemberVoted,
    listen: listen,
    removeDoc: removeDoc,
    logDeletion: logDeletion
  };
})();
