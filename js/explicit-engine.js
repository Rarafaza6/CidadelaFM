/* ==========================================================================
   WAVE EXPLICIT ENGINE v3 — Filtro Rigoroso de Adequação Escolar
   Deteta músicas impróprias para contexto escolar em 4 categorias:
     1. Palavrões & Calão (PT, EN, ES, FR + variantes censuradas)
     2. Conteúdo Sexual Explícito / Funk Proibidão / Insinuação Pesada
     3. Drogas, Substâncias Ilícitas & Consumo Excessivo
     4. Violência Grave, Armas, Crime & Autodestruição
   Fontes de verificação:
     - Análise direta do título e artista
     - Catálogo Apple Music / iTunes (explicit & cleaned flags)
     - Duplo motor de letras: LRCLIB (alta cobertura) + lyrics.ovh
   ========================================================================== */
(function () {
  'use strict';

  const LS_VERDICTS = 'wave_explicit_verdicts_v3';
  const LS_OVERRIDES = 'wave_explicit_overrides_v1';
  const TTL = 90 * 24 * 3600 * 1000;
  const MAX_PARALLEL = 4;

  /* ---------- Normalização ---------- */
  const strip = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const keyOf = (title, artist) => `${String(title || '').trim().toLowerCase()}___${String(artist || '').trim().toLowerCase()}`;
  const cleanTitle = (t) => strip(t)
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/\b(feat|ft|featuring|remaster(ed)?|version|radio edit|explicit|clean|official|video|audio)\b.*$/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mainArtist = (a) => strip(a).split(/\s*(?:,|&|\band\b|\bfeat\b|\bft\b|\bx\b|\bwith\b)\s*/)[0].replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------- Categorias de Conteúdo Impróprio para Escola ---------- */
  const CATEGORIES = [
    {
      id: 'palavroes',
      label: 'Palavrões',
      words: [
        // PT
        'foda', 'foder', 'fodasse', 'fodeu', 'fodido', 'fodida', 'fode', 'fodendo', 'fodam', 'foderam', 'fodi', 'fudido', 'fudida', 'fuder', 'fudendo',
        'caralho', 'caralhos', 'caralhada', 'krl', 'puta', 'putas', 'putedo', 'putaria', 'merda', 'merdas', 'cabrao', 'cabroes',
        'buceta', 'bucetas', 'bct', 'xoxota', 'xereca', 'piroca', 'pirocao', 'cuzao', 'cuzinho', 'arrombado', 'arrombada',
        'vadia', 'vadias', 'vagabunda', 'vagabundo', 'viado', 'paneleiro', 'paneleiros', 'panisga', 'cona', 'conas', 'coninhas',
        'fdp', 'pqp', 'vsf', 'vtnc', 'porra', 'cacete', 'corno', 'cornudo',
        // EN
        'fuck', 'fucking', 'fucked', 'fucker', 'fuckers', 'fuckin', 'motherfucker', 'motherfucking', 'motherfuckers', 'mfer',
        'shit', 'shitty', 'bullshit', 'shitting', 'bitch', 'bitches', 'bitching', 'biatch',
        'asshole', 'assholes', 'arsehole', 'dick', 'dicks', 'dickhead', 'cunt', 'cunts', 'pussy', 'pussies',
        'nigga', 'niggas', 'nigger', 'niggers', 'slut', 'sluts', 'slutty', 'whore', 'whores',
        'cock', 'cocks', 'cocksucker', 'twat', 'wanker', 'bollocks', 'bastard', 'bastards',
        'stfu', 'gtfo', 'idgaf', 'lmfao', 'faggot', 'faggots', 'retard', 'retarded',
        // ES / FR
        'mierda', 'pendejo', 'pendeja', 'pendejos', 'joder', 'cono', 'cabron', 'cabrona', 'cabrones',
        'chingar', 'chingado', 'chingada', 'chingon', 'culero', 'culera', 'pinche', 'maricon',
        'verga', 'mamaguevo', 'mamahuevo', 'hijueputa', 'gonorrea', 'malparido',
        'merde', 'putain', 'connard', 'connasse', 'salope', 'encule', 'enculer', 'batard', 'ntm'
      ],
      phrases: [
        'filho da puta', 'filhos da puta', 'vai tomar no cu', 'tomar no cu', 'vai-te foder', 'vai se foder',
        'hijo de puta', 'hijos de puta', 'son of a bitch', 'piece of shit', 'eat shit', 'dumb ass', 'bad ass',
        'f*ck', 'f**k', 's**t', 'b*tch', 'n*gga', 'c*nt', 'p*ssy', 'c*ralho', 'p*ta', 'm*rda'
      ]
    },
    {
      id: 'sexual',
      label: 'Conteúdo sexual',
      words: [
        // PT / BR
        'transar', 'transando', 'boquete', 'punheta', 'siririca', 'masturbar', 'masturbacao', 'orgasmo',
        'gemendo', 'gozando', 'tesao', 'excitado', 'excitada', 'stripper', 'prostituta', 'suruba', 'menage', 'orgia',
        'quicando', 'rebolando', 'rabao', 'tcheca', 'xota', 'ppk', 'pepeca', 'perereca', 'bilau', 'mamada',
        'bdsm', 'fetiche', 'calcinha', 'pelada', 'pelado', 'novinha',
        // EN / ES
        'blowjob', 'handjob', 'rimjob', 'deepthroat', 'cum', 'cumming', 'cumshot', 'orgasm', 'masturbate', 'masturbating',
        'horny', 'stripclub', 'hooker', 'prostitute', 'thot', 'thots', 'hoes', 'skank',
        'dildo', 'vibrator', 'porn', 'porno', 'pornstar', 'onlyfans', 'hentai', 'kinky', 'erection', 'boner',
        'boobs', 'titties', 'tits', 'nipples', 'twerk', 'twerking', 'doggystyle', 'panties', 'thong', 'milf',
        'perreo', 'bellaqueo', 'bellaca', 'follar', 'follando', 'chuparme', 'nalgas', 'tetas', 'totito', 'chocha'
      ],
      phrases: [
        'pau duro', 'quica na', 'senta na', 'sentando na', 'sem calcinha', 'so de calcinha', 'no motel',
        'freak in the bed', 'having sex', 'have sex', 'suck my', 'lick my', 'ride my', 'bend over', 'doggy style',
        'make me cum', 'wet ass', 'big booty', 'shake that ass', 'eat my ass', 'sex on the'
      ]
    },
    {
      id: 'drogas',
      label: 'Drogas / Álcool',
      words: [
        'cocaina', 'cocaine', 'heroina', 'heroin', 'metanfetamina', 'meth', 'ecstasy', 'mdma', 'molly', 'lsd',
        'ketamina', 'ketamine', 'xanax', 'percocet', 'percs', 'oxycontin', 'fentanyl', 'codeina', 'codeine', 'promethazine',
        'maconha', 'marijuana', 'marihuana', 'ganza', 'haxixe', 'hashish', 'baseado', 'weed', 'blunt', 'blunts',
        'bong', 'kush', 'thc', 'cannabis', 'reefer', 'ganja', 'spliff', 'stoned', 'stoner',
        'snorting', 'overdose', 'traficante', 'traphouse', 'chapado', 'chapada', 'mocado', 'embriagado', 'bebedeira'
      ],
      phrases: [
        'purple drank', 'crystal meth', 'fumar erva', 'fumar um', 'cheirar po', 'trafico de drogas', 'drug dealer',
        'trap house', 'roll a blunt', 'smoke weed', 'smoking weed', 'get high', 'getting high', 'high as fuck',
        'blackout drunk', 'fumar maconha', 'acende o baseado'
      ]
    },
    {
      id: 'violencia',
      label: 'Violência / Armas',
      words: [
        'suicidio', 'suicide', 'suicidal', 'homicidio', 'homicide', 'assassinar', 'assassinato',
        'murder', 'murderer', 'tiroteio', 'shootout', 'glock', 'ak47', 'ar15', 'uzi', 'fuzil', 'metralhadora',
        'headshot', 'gunshot', 'bloodbath', 'facada', 'esfaquear', 'decapitar', 'estupro', 'estuprar',
        'violacao', 'rapist', 'torturar', 'chacina', 'massacre', 'sicario'
      ],
      phrases: [
        'kill myself', 'kill yourself', 'killing myself', 'self harm', 'cut my wrists', 'slit my wrists', 'hang myself',
        'drive-by', 'ak-47', 'ar-15', 'mac-10', 'tec-9', 'bala na cabeca', 'bala na cara',
        'shoot em', 'shoot him', 'shoot her', 'shooting up', 'pull the trigger', 'rape her', 'rape him'
      ]
    }
  ];

  // Compila regexes para cada categoria
  const COMPILED = CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.label,
    wordRe: new RegExp(`(?:^|[^a-z0-9])(${cat.words.map(w => strip(w)).join('|')})(?=$|[^a-z0-9])`, 'g'),
    phrases: cat.phrases.map(p => strip(p))
  }));

  const TAG_RE = /\b(explicit(\s*version)?|dirty(\s*version)?|uncensored|parental advisory|sem censura|versao explicita|proibidao|proibidona|18\+)\b/;

  function scanText(text) {
    const norm = strip(text);
    const words = new Set();
    const cats = new Set();

    COMPILED.forEach(c => {
      let m;
      c.wordRe.lastIndex = 0;
      while ((m = c.wordRe.exec(norm)) !== null) {
        words.add(m[1]);
        cats.add(c.label);
        c.wordRe.lastIndex = m.index + m[0].length - 1;
        if (words.size >= 10) break;
      }
      c.phrases.forEach(p => {
        if (norm.includes(p)) {
          words.add(p);
          cats.add(c.label);
        }
      });
    });

    return {
      words: Array.from(words).slice(0, 8),
      categories: Array.from(cats)
    };
  }

  function findProfanity(text) {
    return scanText(text).words;
  }

  /* ---------- Armazenamento ---------- */
  let verdicts = {};
  let overrides = {};
  try { verdicts = JSON.parse(localStorage.getItem(LS_VERDICTS) || '{}') || {}; } catch (_) { verdicts = {}; }
  try { overrides = JSON.parse(localStorage.getItem(LS_OVERRIDES) || '{}') || {}; } catch (_) { overrides = {}; }
  (function prune() {
    const now = Date.now();
    Object.keys(verdicts).forEach(k => { if (!verdicts[k] || now - (verdicts[k].t || 0) > TTL) delete verdicts[k]; });
  })();

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const keys = Object.keys(verdicts);
        if (keys.length > 1500) keys.sort((a, b) => (verdicts[a].t || 0) - (verdicts[b].t || 0)).slice(0, keys.length - 1500).forEach(k => delete verdicts[k]);
        localStorage.setItem(LS_VERDICTS, JSON.stringify(verdicts));
        localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides));
      } catch (_) {}
    }, 250);
  }

  let notifyTimer = null;
  function notify() {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => document.dispatchEvent(new CustomEvent('wave-explicit-updated')), 120);
  }

  /* ---------- Rede (com timeout) ---------- */
  async function fetchJson(url, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), ms);
    try {
      const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  /** Camada Apple Music: devolve 'explicit' | 'clean' | 'nomatch' | 'error' */
  async function checkItunes(title, artist) {
    try {
      const q = encodeURIComponent(`${title} ${artist}`.replace(/\s+/g, ' ').trim());
      const data = await fetchJson(`https://itunes.apple.com/search?term=${q}&entity=song&limit=10`, 6000);
      const results = (data && data.results) || [];
      const ct = cleanTitle(title);
      const ma = mainArtist(artist);
      let matchedAny = false;
      let foundExplicit = false;

      results.forEach(r => {
        const rt = cleanTitle(r.trackName);
        const ra = strip(r.artistName);
        const titleOk = rt === ct || (ct.length >= 3 && (rt.includes(ct) || ct.includes(rt)));
        const artistOk = !ma || ma === 'artista nao especificado' || ma === 'nao especificado' || ra.includes(ma) || ma.includes(mainArtist(r.artistName));
        if (titleOk && artistOk) {
          matchedAny = true;
          // Se qualquer versão correspondente no Apple Music for explicit ou cleaned (versão censurada de faixa explícita)
          if (r.trackExplicitness === 'explicit' || r.trackExplicitness === 'cleaned') {
            foundExplicit = true;
          }
        }
      });

      if (!matchedAny) return 'nomatch';
      return foundExplicit ? 'explicit' : 'clean';
    } catch (_) { return 'error'; }
  }

  /** Camada Letra Dupla (LRCLIB + lyrics.ovh) */
  async function checkLyrics(title, artist) {
    const t = cleanTitle(title);
    const a = mainArtist(artist);
    if (!t) return { state: 'nolyrics', words: [], categories: [] };

    let lyricsText = '';

    // 1. LRCLIB (rápido e com grande cobertura mundial + PT/BR)
    try {
      const q = encodeURIComponent(`${t} ${a && !a.includes('nao especificado') ? a : ''}`.trim());
      const list = await fetchJson(`https://lrclib.net/api/search?q=${q}`, 6500);
      if (Array.isArray(list) && list.length > 0) {
        const match = list.find(item => {
          const it = cleanTitle(item.trackName || item.name || '');
          const ia = strip(item.artistName || '');
          const tOk = it === t || (t.length >= 3 && (it.includes(t) || t.includes(it)));
          const aOk = !a || a.includes('nao especificado') || ia.includes(a) || a.includes(mainArtist(item.artistName || ''));
          return tOk && aOk && (item.plainLyrics || item.syncedLyrics);
        }) || list[0];
        if (match && (match.plainLyrics || match.syncedLyrics)) {
          lyricsText = String(match.plainLyrics || match.syncedLyrics || '');
        }
      }
    } catch (_) {}

    // 2. Fallback: lyrics.ovh
    if (lyricsText.length < 50 && a && !a.includes('nao especificado')) {
      try {
        const data = await fetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`, 6500);
        if (data && data.lyrics) lyricsText = String(data.lyrics);
      } catch (_) {}
    }

    if (lyricsText.length < 40) return { state: 'nolyrics', words: [], categories: [] };
    const res = scanText(lyricsText);
    return res.words.length
      ? { state: 'explicit', words: res.words, categories: res.categories }
      : { state: 'clean', words: [], categories: [] };
  }

  /* ---------- Análise de uma música ---------- */
  async function analyze(song) {
    const { title, artist } = song;

    // Camada 1 — título/artista
    const textScan = scanText(`${title} ${artist}`);
    if (textScan.words.length || TAG_RE.test(strip(`${title} ${artist}`))) {
      return {
        e: 1,
        src: 'texto',
        cat: textScan.categories.join(', ') || 'Explícita',
        w: textScan.words,
        t: Date.now()
      };
    }

    // Camada 2 e 3 em paralelo
    const [itunes, lyr] = await Promise.all([checkItunes(title, artist), checkLyrics(title, artist)]);

    if (lyr.state === 'explicit') {
      return {
        e: 1,
        src: 'letra',
        cat: (lyr.categories && lyr.categories.length) ? lyr.categories.join(' · ') : 'Linguagem imprópria',
        w: lyr.words,
        t: Date.now()
      };
    }
    if (itunes === 'explicit') {
      return {
        e: 1,
        src: 'itunes',
        cat: 'Apple Music [E]',
        w: lyr.words || [],
        t: Date.now()
      };
    }

    if (itunes === 'error' && lyr.state === 'error') return null;
    const verified = itunes === 'clean' ? (lyr.state === 'clean' ? 'itunes+letra' : 'itunes') : (lyr.state === 'clean' ? 'letra' : 'limitada');
    return { e: 0, src: verified, cat: '', w: [], t: Date.now() };
  }

  /* ---------- Fila com concorrência ---------- */
  const queue = [];
  const inFlight = new Set();
  const failedUntil = new Map();
  let running = 0;

  function pump() {
    while (running < MAX_PARALLEL && queue.length) {
      const song = queue.shift();
      if (verdicts[song.key] || inFlight.has(song.key)) continue;
      inFlight.add(song.key);
      running++;
      analyze(song).then(v => {
        if (v) {
          verdicts[song.key] = v;
          persist();
          syncDatabase(song, v);
        } else {
          failedUntil.set(song.key, Date.now() + 60000);
        }
      }).catch(() => failedUntil.set(song.key, Date.now() + 60000))
        .finally(() => {
          inFlight.delete(song.key);
          running--;
          notify();
          pump();
        });
    }
    if (running === 0 && !queue.length) notify();
  }

  function syncDatabase(song, v) {
    try {
      if (!window.db || !Array.isArray(song.ids) || !song.ids.length) return;
      const want = !!v.e;
      if (song.storedExplicit === want) return;
      if (typeof window.db.updateSuggestionsExplicitBatch === 'function') window.db.updateSuggestionsExplicitBatch(song.ids, want);
    } catch (_) {}
  }

  /* ---------- API pública ---------- */
  const api = {
    keyOf,

    /** Estado síncrono: { state:'explicit'|'clean'|'unknown', src, cat, words, checking, manual } */
    verdict(title, artist) {
      const key = keyOf(title, artist);
      const o = overrides[key];
      if (o === 'safe') return { state: 'clean', src: 'manual', cat: '', words: [], checking: false, manual: true };
      if (o === 'explicit') return { state: 'explicit', src: 'manual', cat: 'Marcada manualmente', words: [], checking: false, manual: true };
      const v = verdicts[key];
      if (v) return { state: v.e ? 'explicit' : 'clean', src: v.src, cat: v.cat || '', words: v.w || [], checking: false, manual: false };

      const fast = scanText(`${title} ${artist}`);
      if (fast.words.length || TAG_RE.test(strip(`${title} ${artist}`))) {
        return { state: 'explicit', src: 'texto', cat: fast.categories.join(' · ') || 'Explícita', words: fast.words, checking: false, manual: false };
      }
      return { state: 'unknown', src: '', cat: '', words: [], checking: inFlight.has(key) || queue.some(s => s.key === key), manual: false };
    },

    isExplicit(title, artist) {
      return api.verdict(title, artist).state === 'explicit';
    },

    scan(songs) {
      const now = Date.now();
      let added = 0;
      (songs || []).forEach(s => {
        if (!s || !s.key) return;
        if (verdicts[s.key] || overrides[s.key] || inFlight.has(s.key)) return;
        if ((failedUntil.get(s.key) || 0) > now) return;
        if (queue.some(q => q.key === s.key)) return;
        queue.push({ key: s.key, title: s.title || s.songTitle, artist: s.artist, ids: s.ids, storedExplicit: !!s.storedExplicit });
        added++;
      });
      if (added) { notify(); pump(); }
      return added;
    },

    rescan(songs) {
      (songs || []).forEach(s => { delete verdicts[s.key]; failedUntil.delete(s.key); });
      persist();
      return api.scan(songs);
    },

    stats(songs) {
      let done = 0;
      (songs || []).forEach(s => { if (verdicts[s.key] || overrides[s.key]) done++; });
      return { total: (songs || []).length, done, busy: running + queue.length };
    },

    setOverride(key, mode) {
      if (mode) overrides[key] = mode; else delete overrides[key];
      persist();
      notify();
    },

    findProfanity,
    scanText
  };

  window.ExplicitEngine = api;
  window.isExplicitSong = (title, artist) => api.isExplicit(title, artist);
  window.waveIsExplicit = window.isExplicitSong;

  function groupAllSuggestions() {
    if (!window.db || typeof window.db.getSuggestions !== 'function') return [];
    const map = new Map();
    (window.db.getSuggestions() || []).forEach(item => {
      if (!item) return;
      const title = String(item.songTitle || item.title || '').trim();
      const artist = String(item.artist || '').trim();
      if (!title && !artist) return;
      const dTitle = title || 'Música sem título';
      const dArtist = artist || 'Artista não especificado';
      const key = keyOf(dTitle, dArtist);
      if (!map.has(key)) map.set(key, { key, title: dTitle, artist: dArtist, ids: [], storedExplicit: false });
      const g = map.get(key);
      if (item.id) g.ids.push(item.id);
      if (item.explicit === true) g.storedExplicit = true;
    });
    return Array.from(map.values());
  }
  api.groupAll = groupAllSuggestions;

  let watchTimer = null;
  function watch() {
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => api.scan(groupAllSuggestions()), 600);
  }
  document.addEventListener('radio-db-updated', (e) => {
    const c = e && e.detail && e.detail.collection;
    if (!c || c === 'suggestions') watch();
  });
  window.addEventListener('load', () => setTimeout(watch, 1200));
})();
