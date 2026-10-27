/* ==========================================================================
   NERD ALERT — LÓGICA DA PÁGINA DO ALUNO (nerd-alert.html)
   Exibe apenas se existir um desafio ativo no painel de administração e
   preserva o carimbo temporal exato (data, hora, segundo e milissegundo).
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_PREFIX = 'wave_nerd_submitted_';
  let currentChallenge = null;
  let clockInterval = null;

  function formatExactTimestamp(ms) {
    const d = new Date(Number(ms) || Date.now());
    const pad2 = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} às ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
  }

  function startLiveClock() {
    const clockEl = document.getElementById('nerdLiveClock');
    if (!clockEl) return;
    const updateClock = () => {
      const now = new Date();
      const pad2 = (n) => String(n).padStart(2, '0');
      clockEl.innerHTML = `<i class="ri-time-line" aria-hidden="true"></i> ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    };
    updateClock();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateClock, 1000);
  }

  function showFeedback(type, message) {
    const box = document.getElementById('nerdFeedback');
    if (!box) return;
    if (!message) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }
    const icon = type === 'success'
      ? 'ri-checkbox-circle-fill'
      : type === 'warning'
        ? 'ri-alert-fill'
        : 'ri-error-warning-fill';
    box.className = `form-feedback ${type}`;
    box.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span></span>`;
    const span = box.querySelector('span');
    if (span) span.textContent = message;
    box.style.display = 'flex';
  }

  function getSavedReceipt(challengeId) {
    if (!challengeId) return null;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + challengeId);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveReceipt(challengeId, receipt) {
    if (!challengeId) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + challengeId, JSON.stringify(receipt));
    } catch (_) {}
  }

  function renderReceiptState(receipt) {
    const form = document.getElementById('nerdSubmissionForm');
    const receiptBox = document.getElementById('nerdSubmittedReceipt');
    if (form) form.style.display = 'none';
    if (receiptBox) {
      receiptBox.style.display = 'block';
      const nameEl = document.getElementById('receiptStudentName');
      const classEl = document.getElementById('receiptStudentClass');
      const emailEl = document.getElementById('receiptStudentEmail');
      const timeEl = document.getElementById('receiptTimestamp');
      if (nameEl) nameEl.textContent = receipt.fullName || `${receipt.firstName || ''} ${receipt.lastName || ''}`.trim();
      if (classEl) classEl.textContent = receipt.studentClass || '—';
      if (emailEl) emailEl.textContent = receipt.email || '—';
      if (timeEl) timeEl.textContent = formatExactTimestamp(receipt.submittedAt);
    }
  }

  function renderChallengeView() {
    const loadingEl = document.getElementById('nerdLoadingState');
    const inactiveEl = document.getElementById('nerdInactiveState');
    const activeContainer = document.getElementById('nerdActiveContainer');

    if (!window.db || typeof window.db.getActiveNerdChallenge !== 'function') {
      if (loadingEl) loadingEl.style.display = 'none';
      if (inactiveEl) inactiveEl.style.display = 'block';
      if (activeContainer) activeContainer.style.display = 'none';
      return;
    }

    const challenge = window.db.getActiveNerdChallenge();
    currentChallenge = challenge;

    if (loadingEl) loadingEl.style.display = 'none';

    if (!challenge || !challenge.active) {
      if (inactiveEl) inactiveEl.style.display = 'block';
      if (activeContainer) activeContainer.style.display = 'none';
      return;
    }

    if (inactiveEl) inactiveEl.style.display = 'none';
    if (activeContainer) activeContainer.style.display = '';

    const titleEl = document.getElementById('nerdChallengeTitle');
    const questionEl = document.getElementById('nerdChallengeQuestion');
    const imgWrap = document.getElementById('nerdChallengeImageWrap');
    const imgEl = document.getElementById('nerdChallengeImage');
    const hintWrap = document.getElementById('nerdChallengeHintWrap');
    const hintEl = document.getElementById('nerdChallengeHint');
    const prizeWrap = document.getElementById('nerdChallengePrizeWrap');
    const prizeEl = document.getElementById('nerdChallengePrize');

    if (titleEl) titleEl.textContent = challenge.title || 'Desafio Alerta Nerd';
    if (questionEl) questionEl.textContent = challenge.question || '';

    if (imgWrap && imgEl) {
      if (challenge.image && String(challenge.image).trim()) {
        imgEl.src = challenge.image;
        imgWrap.style.display = 'block';
      } else {
        imgEl.removeAttribute('src');
        imgWrap.style.display = 'none';
      }
    }

    if (hintWrap && hintEl) {
      if (challenge.hint && String(challenge.hint).trim()) {
        hintEl.textContent = challenge.hint;
        hintWrap.style.display = 'block';
      } else {
        hintWrap.style.display = 'none';
      }
    }

    if (prizeWrap && prizeEl) {
      if (challenge.prize && String(challenge.prize).trim()) {
        prizeEl.textContent = challenge.prize;
        prizeWrap.style.display = 'flex';
      } else {
        prizeWrap.style.display = 'none';
      }
    }

    const existingReceipt = getSavedReceipt(challenge.id);
    if (existingReceipt) {
      renderReceiptState(existingReceipt);
    } else {
      const form = document.getElementById('nerdSubmissionForm');
      const receiptBox = document.getElementById('nerdSubmittedReceipt');
      if (form) form.style.display = 'block';
      if (receiptBox) receiptBox.style.display = 'none';
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    showFeedback('', '');

    if (!currentChallenge || !currentChallenge.active) {
      showFeedback('error', 'Este desafio já não se encontra ativo.');
      renderChallengeView();
      return;
    }

    const firstNameInput = document.getElementById('nerdFirstName');
    const lastNameInput = document.getElementById('nerdLastName');
    const classInput = document.getElementById('nerdStudentClass');
    const emailInput = document.getElementById('nerdEmail');
    const answerInput = document.getElementById('nerdAnswer');
    const submitBtn = document.getElementById('nerdSubmitBtn');

    const firstName = String(firstNameInput?.value || '').trim();
    const lastName = String(lastNameInput?.value || '').trim();
    const studentClass = String(classInput?.value || '').trim().toUpperCase();
    const email = String(emailInput?.value || '').trim().toLowerCase();
    const answer = String(answerInput?.value || '').trim();

    if (!firstName) {
      showFeedback('warning', 'Indica o teu primeiro nome.');
      firstNameInput?.focus();
      return;
    }
    if (!lastName) {
      showFeedback('warning', 'Indica o teu apelido.');
      lastNameInput?.focus();
      return;
    }
    if (!studentClass) {
      showFeedback('warning', 'Indica a tua turma (ex.: 10.º A).');
      classInput?.focus();
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showFeedback('warning', 'Introduz um endereço de email válido.');
      emailInput?.focus();
      return;
    }
    if (!answer) {
      showFeedback('warning', 'Escreve a tua resposta ao desafio antes de submeter.');
      answerInput?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin" aria-hidden="true"></i> A registar resposta...';
    }

    try {
      const entry = window.db.addNerdSubmission({
        challengeId: currentChallenge.id,
        challengeTitle: currentChallenge.title || 'Desafio Alerta Nerd',
        firstName,
        lastName,
        studentClass,
        email,
        answer
      });

      if (entry && entry._writePromise) {
        await entry._writePromise;
      }

      saveReceipt(currentChallenge.id, {
        id: entry.id,
        challengeId: currentChallenge.id,
        firstName,
        lastName,
        fullName: entry.fullName,
        studentClass,
        email,
        submittedAt: entry.submittedAt,
        submittedAtIso: entry.submittedAtIso
      });

      renderReceiptState(entry);
    } catch (error) {
      console.error('Erro ao submeter resposta ao Alerta Nerd:', error);
      showFeedback('error', 'Não foi possível enviar a tua resposta. Verifica a tua ligação e tenta novamente.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ri-flashlight-fill" aria-hidden="true"></i> Submeter Resposta e Registar Hora';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    startLiveClock();

    const answerInput = document.getElementById('nerdAnswer');
    const charCount = document.getElementById('nerdAnswerCharCount');
    if (answerInput && charCount) {
      answerInput.addEventListener('input', () => {
        const len = answerInput.value.length;
        charCount.textContent = `${len} / 500`;
        charCount.classList.toggle('near-limit', len >= 430);
      });
    }

    const form = document.getElementById('nerdSubmissionForm');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }

    document.addEventListener('radio-db-updated', (e) => {
      if (!e.detail || e.detail.collection === 'nerdChallenges') {
        renderChallengeView();
      }
    });

    if (window.db && typeof window.db.ready === 'function') {
      await window.db.ready();
    }
    renderChallengeView();
  });
})();
