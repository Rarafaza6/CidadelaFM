/* ==========================================================================
  RÁDIO EBS CIDADELA - CAMADA DE DADOS FIREBASE
  Os dados da aplicação vivem no Cloud Firestore. O LocalStorage fica reservado
  apenas ao contador diário local de pedidos de música.
  ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyCn04I22HdbvOFSFpxci1l_uRRepcLk5f8",
  authDomain: "cidadelafm.firebaseapp.com",
  databaseURL: "https://cidadelafm-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cidadelafm",
  storageBucket: "cidadelafm.firebasestorage.app",
  messagingSenderId: "312932696570",
  appId: "1:312932696570:web:2faf5d0036f2bb3b4fa443",
  measurementId: "G-QZ6Q7RPG9B"
};

const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);

const firestore = firebaseApp.firestore();
firestore.settings({ merge: true, ignoreUndefinedProperties: true });
const authInstance = typeof firebaseApp.auth === 'function' ? firebaseApp.auth() : null;
window.firebaseServices = {
  app: firebaseApp,
  firestore,
  auth: authInstance
};
window.showFirebaseError = function (container) {
  if (!container) return;
  container.innerHTML = '<div class="firebase-error"><i class="ri-cloud-off-line"></i><strong>Ligação aos conteúdos indisponível.</strong><span>Confirma que o Cloud Firestore está criado e que as regras em <code>firestore.rules</code> foram publicadas.</span></div>';
};
// Coleções públicas iniciam vazias para aguardar conteúdos oficiais da Rádio
const DEFAULT_PODCASTS = [];

const DEFAULT_RUNDOWNS = [];

const DEFAULT_TEAM_MEMOS = [];

const DEFAULT_ANNOUNCEMENTS = [];

const DEFAULT_ANNOUNCEMENT_IMAGE = 'assets/logo-radio.jpg';

const DEFAULT_LINKS = [];

const DEFAULT_SUGGESTIONS = [];

// Efemérides recorrentes para inspirar a programação e os avisos em antena.
const EDITORIAL_CALENDAR_DATES = [
  { key: 'world-radio-day', monthDay: '02-13', title: 'Dia Mundial da Rádio', category: 'Dia temático', notes: 'Uma oportunidade para celebrar as vozes, programas e histórias da rádio.' },
  { key: 'world-poetry-day', monthDay: '03-21', title: 'Dia Mundial da Poesia', category: 'Dia temático', notes: 'Leitura de poemas, letras e autores escolhidos pela equipa.' },
  { key: 'world-theatre-day', monthDay: '03-27', title: 'Dia Mundial do Teatro', category: 'Dia temático', notes: 'Liga a música, representação e cultura em antena.' },
  { key: 'avicii-remembrance', monthDay: '04-20', title: 'Memória de Avicii', category: 'Memória musical', notes: 'Recordar o produtor e DJ Avicii.' },
  { key: 'prince-remembrance', monthDay: '04-21', title: 'Memória de Prince', category: 'Memória musical', notes: 'Recordar a obra e a influência de Prince.' },
  { key: 'world-book-day', monthDay: '04-23', title: 'Dia Mundial do Livro', category: 'Dia temático', notes: 'Sugestões de leitura, adaptações e bandas sonoras.' },
  { key: 'international-jazz-day', monthDay: '04-30', title: 'Dia Internacional do Jazz', category: 'Dia temático', notes: 'Destaque para jazz, improvisação e artistas essenciais.' },
  { key: 'press-freedom-day', monthDay: '05-03', title: 'Dia Mundial da Liberdade de Imprensa', category: 'Dia temático', notes: 'Uma conversa sobre jornalismo, informação e voz.' },
  { key: 'bob-marley-remembrance', monthDay: '05-11', title: 'Memória de Bob Marley', category: 'Memória musical', notes: 'Recordar Bob Marley e o legado do reggae.' },
  { key: 'cultural-diversity-day', monthDay: '05-21', title: 'Dia Mundial da Diversidade Cultural', category: 'Dia temático', notes: 'Dar espaço a músicas, línguas e histórias de diferentes culturas.' },
  { key: 'tina-turner-remembrance', monthDay: '05-24', title: 'Memória de Tina Turner', category: 'Memória musical', notes: 'Recordar Tina Turner e as suas grandes canções.' },
  { key: 'childrens-day-portugal', monthDay: '06-01', title: 'Dia Mundial da Criança', category: 'Dia temático', notes: 'Programação leve, inclusiva e dedicada à comunidade escolar.' },
  { key: 'world-music-day', monthDay: '06-21', title: 'Dia Mundial da Música', category: 'Dia temático', notes: 'Celebrar todos os estilos e os músicos da escola.' },
  { key: 'michael-jackson-remembrance', monthDay: '06-25', title: 'Memória de Michael Jackson', category: 'Memória musical', notes: 'Recordar Michael Jackson e o seu impacto na música pop.' },
  { key: 'amy-winehouse-remembrance', monthDay: '07-23', title: 'Memória de Amy Winehouse', category: 'Memória musical', notes: 'Recordar Amy Winehouse e a sua voz singular.' },
  { key: 'sinead-oconnor-remembrance', monthDay: '07-26', title: 'Memória de Sinéad O’Connor', category: 'Memória musical', notes: 'Recordar Sinéad O’Connor e o seu percurso artístico.' },
  { key: 'international-youth-day', monthDay: '08-12', title: 'Dia Internacional da Juventude', category: 'Dia temático', notes: 'Dar palco às ideias e projetos dos alunos.' },
  { key: 'elvis-aretha-remembrance', monthDay: '08-16', title: 'Memória de Elvis Presley e Aretha Franklin', category: 'Memória musical', notes: 'Uma dupla homenagem a duas vozes incontornáveis.' },
  { key: 'international-music-day', monthDay: '10-01', title: 'Dia Internacional da Música', category: 'Dia temático', notes: 'Uma emissão centrada nas escolhas musicais da comunidade.' },
  { key: 'world-teachers-day', monthDay: '10-05', title: 'Dia Mundial do Professor', category: 'Dia temático', notes: 'Agradecer e ouvir quem ensina na escola.' },
  { key: 'world-childrens-day', monthDay: '11-20', title: 'Dia Mundial da Criança', category: 'Dia temático', notes: 'Direitos, participação e voz dos mais novos.' },
  { key: 'freddie-mercury-remembrance', monthDay: '11-24', title: 'Memória de Freddie Mercury', category: 'Memória musical', notes: 'Recordar Freddie Mercury e os Queen.' },
  { key: 'john-lennon-remembrance', monthDay: '12-08', title: 'Memória de John Lennon', category: 'Memória musical', notes: 'Recordar John Lennon, os Beatles e as canções pela paz.' }
];

// Lista anual de observâncias internacionais (ONU/UNESCO) e efemérides escolares relevantes.
// Mantida separada para que o calendário apresente datas portuguesas sem depender de serviços externos.
const INTERNATIONAL_THEME_DATES = [
  ['01-04', 'Dia Mundial do Braille'], ['01-24', 'Dia Internacional da Educação'], ['01-26', 'Dia Internacional da Energia Limpa'], ['01-27', 'Dia Internacional em Memória das Vítimas do Holocausto'], ['01-28', 'Dia Internacional da Coexistência Pacífica'],
  ['02-02', 'Dia Mundial das Zonas Húmidas'], ['02-04', 'Dia Internacional da Fraternidade Humana'], ['02-06', 'Dia Internacional da Tolerância Zero à Mutilação Genital Feminina'], ['02-10', 'Dia Mundial das Leguminosas'], ['02-10', 'Dia Internacional do Leopardo-Árabe'], ['02-11', 'Dia Internacional das Mulheres e Raparigas na Ciência'], ['02-12', 'Dia Internacional para a Prevenção do Extremismo Violento'], ['02-17', 'Dia Mundial da Resiliência do Turismo'], ['02-20', 'Dia Mundial da Justiça Social'], ['02-21', 'Dia Internacional da Língua Materna'],
  ['03-01', 'Dia da Discriminação Zero'], ['03-01', 'Dia Mundial das Ervas Marinhas'], ['03-03', 'Dia Mundial da Vida Selvagem'], ['03-05', 'Dia da Sensibilização para o Desarmamento e Não-Proliferação'], ['03-08', 'Dia Internacional da Mulher'], ['03-10', 'Dia Internacional das Mulheres Juízas'], ['03-15', 'Dia Internacional de Combate à Islamofobia'], ['03-20', 'Dia Internacional da Felicidade'], ['03-20', 'Dia da Língua Francesa'], ['03-21', 'Dia Internacional das Florestas'], ['03-21', 'Dia Internacional pela Eliminação da Discriminação Racial'], ['03-21', 'Dia Mundial da Síndrome de Down'], ['03-21', 'Dia Mundial da Água'], ['03-22', 'Dia Mundial da Água'], ['03-23', 'Dia Meteorológico Mundial'], ['03-24', 'Dia Mundial da Tuberculose'], ['03-25', 'Dia Internacional em Memória das Vítimas da Escravatura'], ['03-30', 'Dia Internacional do Lixo Zero'],
  ['04-02', 'Dia Mundial da Consciencialização do Autismo'], ['04-04', 'Dia Internacional para Sensibilização sobre Minas'], ['04-05', 'Dia Internacional da Consciência'], ['04-06', 'Dia Internacional do Desporto para o Desenvolvimento e a Paz'], ['04-07', 'Dia Mundial da Saúde'], ['04-12', 'Dia Internacional do Voo Espacial Humano'], ['04-14', 'Dia Mundial da Doença de Chagas'], ['04-15', 'Dia Internacional do Bem-Estar'], ['04-20', 'Dia da Língua Chinesa'], ['04-21', 'Dia Mundial da Criatividade e Inovação'], ['04-22', 'Dia Internacional da Mãe Terra'], ['04-23', 'Dia Internacional das Raparigas nas TIC'], ['04-23', 'Dia Mundial do Livro e dos Direitos de Autor'], ['04-23', 'Dia da Língua Inglesa'], ['04-23', 'Dia da Língua Espanhola'], ['04-25', 'Dia Mundial da Malária'], ['04-26', 'Dia Mundial da Propriedade Intelectual'], ['04-28', 'Dia Mundial da Segurança e Saúde no Trabalho'],
  ['05-02', 'Dia Mundial do Atum'], ['05-03', 'Dia Mundial da Liberdade de Imprensa'], ['05-05', 'Dia Mundial da Língua Portuguesa'], ['05-08', 'Dia de Memória e Reconciliação pelas vítimas da Segunda Guerra Mundial'], ['05-10', 'Dia Internacional da Argania'], ['05-12', 'Dia Internacional da Saúde das Plantas'], ['05-15', 'Dia Internacional das Famílias'], ['05-16', 'Dia Internacional da Luz'], ['05-17', 'Dia Mundial das Telecomunicações e da Sociedade da Informação'], ['05-19', 'Dia Mundial do Fair Play'], ['05-20', 'Dia Mundial das Abelhas'], ['05-21', 'Dia Internacional do Chá'], ['05-22', 'Dia Internacional da Biodiversidade'], ['05-25', 'Dia Mundial do Futebol'], ['05-29', 'Dia Internacional dos Capacetes Azuis da ONU'], ['05-30', 'Dia Internacional da Batata'], ['05-31', 'Dia Mundial sem Tabaco'],
  ['06-01', 'Dia Global dos Pais'], ['06-03', 'Dia Mundial da Bicicleta'], ['06-04', 'Dia Internacional das Crianças Vítimas Inocentes de Agressão'], ['06-05', 'Dia Mundial do Ambiente'], ['06-07', 'Dia Mundial da Segurança dos Alimentos'], ['06-08', 'Dia Mundial dos Oceanos'], ['06-10', 'Dia Internacional do Diálogo entre Civilizações'], ['06-11', 'Dia Internacional do Brincar'], ['06-12', 'Dia Mundial contra o Trabalho Infantil'], ['06-13', 'Dia Internacional da Consciencialização sobre o Albinismo'], ['06-14', 'Dia Mundial do Dador de Sangue'], ['06-15', 'Dia Mundial de Consciencialização da Violência contra a Pessoa Idosa'], ['06-16', 'Dia Internacional das Remessas Familiares'], ['06-17', 'Dia Mundial de Combate à Desertificação e Seca'], ['06-18', 'Dia da Gastronomia Sustentável'], ['06-19', 'Dia Internacional para a Eliminação da Violência Sexual em Conflito'], ['06-20', 'Dia Mundial do Refugiado'], ['06-21', 'Dia Internacional do Yoga'], ['06-23', 'Dia das Nações Unidas para o Serviço Público'], ['06-24', 'Dia Internacional das Mulheres na Diplomacia'], ['06-25', 'Dia do Marinheiro'], ['06-26', 'Dia Internacional contra o Abuso e Tráfico Ilícito de Drogas'], ['06-27', 'Dia das Micro, Pequenas e Médias Empresas'], ['06-29', 'Dia Internacional dos Trópicos'], ['06-30', 'Dia Internacional dos Asteroides'],
  ['07-05', 'Dia Internacional das Cooperativas'], ['07-06', 'Dia Mundial do Desenvolvimento Rural'], ['07-07', 'Dia Mundial da Língua Kiswahili'], ['07-11', 'Dia Mundial da População'], ['07-12', 'Dia Internacional da Esperança'], ['07-15', 'Dia Mundial das Competências dos Jovens'], ['07-18', 'Dia Internacional Nelson Mandela'], ['07-20', 'Dia Mundial do Xadrez'], ['07-20', 'Dia Internacional da Lua'], ['07-25', 'Dia Mundial de Prevenção do Afogamento'], ['07-28', 'Dia Mundial das Hepatites'], ['07-30', 'Dia Internacional da Amizade'], ['07-30', 'Dia Mundial contra o Tráfico de Pessoas'],
  ['08-01', 'Início da Semana Mundial do Aleitamento Materno'], ['08-09', 'Dia Internacional dos Povos Indígenas'], ['08-11', 'Dia Mundial do Steelpan'], ['08-19', 'Dia Mundial Humanitário'], ['08-21', 'Dia Internacional de Homenagem às Vítimas do Terrorismo'], ['08-23', 'Dia Internacional de Memória do Tráfico de Escravos e sua Abolição'], ['08-27', 'Dia Mundial dos Lagos'], ['08-29', 'Dia Internacional contra os Ensaios Nucleares'], ['08-30', 'Dia Internacional das Vítimas de Desaparecimentos Forçados'],
  ['09-05', 'Dia Internacional da Caridade'], ['09-07', 'Dia Internacional do Ar Limpo para Céus Azuis'], ['09-08', 'Dia Internacional da Literacia'], ['09-09', 'Dia Internacional para Proteger a Educação contra Ataques'], ['09-15', 'Dia Internacional da Democracia'], ['09-16', 'Dia Internacional para a Preservação da Camada de Ozono'], ['09-17', 'Dia Mundial da Segurança do Doente'], ['09-18', 'Dia Internacional da Igualdade Salarial'], ['09-20', 'Dia Mundial da Limpeza'], ['09-21', 'Dia Internacional da Paz'], ['09-23', 'Dia Internacional das Línguas Gestuais'], ['09-27', 'Dia Mundial do Turismo'], ['09-28', 'Dia Internacional do Acesso Universal à Informação'], ['09-29', 'Dia Internacional de Consciencialização sobre Perdas e Desperdício Alimentar'], ['09-30', 'Dia Internacional da Tradução'],
  ['10-01', 'Dia Internacional das Pessoas Idosas'], ['10-02', 'Dia Internacional da Não Violência'], ['10-05', 'Dia Mundial do Professor'], ['10-07', 'Dia Mundial do Algodão'], ['10-09', 'Dia Mundial dos Correios'], ['10-10', 'Dia Mundial da Saúde Mental'], ['10-11', 'Dia Internacional da Rapariga'], ['10-13', 'Dia Internacional para a Redução do Risco de Catástrofes'], ['10-15', 'Dia Internacional das Mulheres Rurais'], ['10-16', 'Dia Mundial da Alimentação'], ['10-17', 'Dia Internacional para a Erradicação da Pobreza'], ['10-24', 'Dia das Nações Unidas'], ['10-24', 'Dia Mundial da Informação sobre Desenvolvimento'], ['10-27', 'Dia Mundial do Património Audiovisual'], ['10-29', 'Dia Internacional dos Cuidados e Apoio'], ['10-31', 'Dia Mundial das Cidades'],
  ['11-02', 'Dia Internacional pelo Fim da Impunidade dos Crimes contra Jornalistas'], ['11-05', 'Dia Mundial de Consciencialização sobre Tsunamis'], ['11-10', 'Dia Mundial da Ciência para a Paz e o Desenvolvimento'], ['11-14', 'Dia Mundial da Diabetes'], ['11-16', 'Dia Internacional da Tolerância'], ['11-19', 'Dia Mundial da Sanita'], ['11-20', 'Dia Mundial da Criança'], ['11-21', 'Dia Mundial da Televisão'], ['11-25', 'Dia Internacional pela Eliminação da Violência contra as Mulheres'], ['11-26', 'Dia Mundial do Transporte Sustentável'], ['11-29', 'Dia Internacional de Solidariedade com o Povo Palestiniano'], ['11-30', 'Dia de Memória de Todas as Vítimas de Guerra Química'],
  ['12-01', 'Dia Mundial de Luta contra a Sida'], ['12-02', 'Dia Internacional para a Abolição da Escravatura'], ['12-03', 'Dia Internacional das Pessoas com Deficiência'], ['12-04', 'Dia Internacional dos Bancos'], ['12-05', 'Dia Mundial do Solo'], ['12-05', 'Dia Internacional do Voluntariado'], ['12-07', 'Dia Internacional da Aviação Civil'], ['12-09', 'Dia Internacional contra a Corrupção'], ['12-10', 'Dia dos Direitos Humanos'], ['12-11', 'Dia Internacional das Montanhas'], ['12-12', 'Dia Internacional da Cobertura Universal de Saúde'], ['12-18', 'Dia Internacional dos Migrantes'], ['12-20', 'Dia Internacional da Solidariedade Humana'], ['12-21', 'Dia Mundial da Meditação'], ['12-21', 'Dia Mundial do Basquetebol'], ['12-27', 'Dia Internacional de Preparação para Epidemias']
];

function formatDateKey(year, date) {
  return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getEasterSunday(year) {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(year, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}

function getPortugalPublicHolidays(year) {
  const easter = getEasterSunday(year);
  const movable = (offset, title) => { const date = new Date(easter); date.setDate(easter.getDate() + offset); return { date: formatDateKey(year, date), title }; };
  const fixed = [['01-01', 'Ano Novo'], ['04-25', 'Dia da Liberdade'], ['05-01', 'Dia do Trabalhador'], ['06-10', 'Dia de Portugal, de Camões e das Comunidades Portuguesas'], ['08-15', 'Assunção de Nossa Senhora'], ['10-05', 'Implantação da República'], ['11-01', 'Dia de Todos-os-Santos'], ['12-01', 'Restauração da Independência'], ['12-08', 'Imaculada Conceição'], ['12-25', 'Natal']];
  return [...fixed.map(([monthDay, title]) => ({ date: `${year}-${monthDay}`, title })), movable(-47, 'Terça-feira de Carnaval'), movable(-2, 'Sexta-feira Santa'), movable(0, 'Domingo de Páscoa'), movable(60, 'Corpo de Deus')].map((item, index) => ({ id: `pt-holiday-${year}-${index}`, ...item, category: 'Feriado em Portugal', notes: 'Feriado ou data de referência do calendário português.', source: 'portugal', readOnly: true }));
}
function getEditorialCalendarEvents() {
  const currentYear = new Date().getFullYear();
  const sourceDates = [...EDITORIAL_CALENDAR_DATES, ...INTERNATIONAL_THEME_DATES.map(([monthDay, title], index) => ({ key: `international-${index}`, monthDay, title, category: 'Dia temático', notes: 'Efeméride internacional para inspiração editorial.' }))];
  return [currentYear - 1, currentYear, currentYear + 1].flatMap(year => [
    ...sourceDates.map(item => ({ id: `editorial-${year}-${item.key}`, date: `${year}-${item.monthDay}`, title: item.title, category: item.category, notes: item.notes, source: 'editorial', readOnly: true })),
    ...getPortugalPublicHolidays(year)
  ]);
}
// Camada de Armazenamento Inteligente (Local Storage Database)
class RadioDatabase {
  constructor() {
    this.cache = {
      podcasts: [],
      announcements: [],
      links: [],
      nerdChallenges: [],
      teamMembers: [],
      suggestions: [],
      messages: [],
      calendarEvents: [],
      adminUsers: [],
      rundowns: [],
      teamMemos: [],
      polls: [],
      tasks: [],
      nerdSubmissions: []
    };
    this.error = null;
    this.readyPromise = this.initialize();
  }

  async initialize() {
    try {
      await Promise.all([
        this.loadCollection('podcasts', DEFAULT_PODCASTS),
        this.loadCollection('announcements', DEFAULT_ANNOUNCEMENTS),
        this.loadCollection('links', DEFAULT_LINKS),
        this.loadCollection('nerdChallenges', []),
        this.loadCollection('teamMembers', [])
      ]);
      this.syncMaintenanceState();
      this.watchCollections(['podcasts', 'announcements', 'links', 'nerdChallenges', 'teamMembers']);
      this.clearLegacyStorage(['radio_podcasts', 'radio_announcements', 'radio_links']);
    } catch (error) {
      this.error = error;
      console.error('Não foi possível ligar ao Firestore:', error);
    }
  }

  ready() {
    return this.readyPromise;
  }

  async loadPrivateCollections() {
    await Promise.allSettled([
      this.loadCollection('suggestions', DEFAULT_SUGGESTIONS),
      this.loadCollection('messages', []),
      this.loadCollection('rundowns', DEFAULT_RUNDOWNS),
      this.loadCollection('teamMemos', DEFAULT_TEAM_MEMOS),
      this.loadCollection('calendarEvents', []),
      this.loadCollection('adminUsers', []),
      this.loadCollection('polls', []),
      this.loadCollection('tasks', []),
      this.loadCollection('nerdSubmissions', [])
    ]);
    this.watchCollections(['suggestions', 'messages', 'rundowns', 'teamMemos', 'calendarEvents', 'adminUsers', 'polls', 'tasks', 'nerdSubmissions']);
    this.clearLegacyStorage(['radio_suggestions', 'radio_messages', 'radio_rundowns', 'radio_team_memos', 'radio_calendar_events', 'radio_admin_users']);
  }

  clearLegacyStorage(keys) {
    keys.forEach(key => localStorage.removeItem(key));
  }

  async loadCollection(name, seed = []) {
    try {
      const collection = firestore.collection(name);
      const snapshot = await this.withTimeout(collection.get(), 10000);
      if (snapshot.empty && seed && seed.length > 0) {
        this.cache[name] = [...seed];
      } else {
        this.cache[name] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (error) {
      console.warn(`Aviso ao carregar a coleção '${name}' do Firestore:`, error.message || error);
      if (!this.cache[name] || this.cache[name].length === 0) {
        this.cache[name] = Array.isArray(seed) ? [...seed] : [];
      }
    }
  }

  withTimeout(promise, milliseconds) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ligação ao Firestore excedeu o tempo limite.')), milliseconds))
    ]);
  }

  watchCollections(collectionNames) {
    collectionNames.forEach(name => {
      try {
        firestore.collection(name).onSnapshot(snapshot => {
          if (!snapshot.empty) {
            this.cache[name] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          } else {
            this.cache[name] = [];
          }
          if (name === 'announcements') {
            this.syncMaintenanceState();
          }
          document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: name } }));
        }, error => {
          console.warn(`Aviso no listener da coleção '${name}':`, error.message || error);
        });
      } catch (err) {
        console.warn(`Não foi possível iniciar watcher para '${name}':`, err.message || err);
      }
    });
  }

  write(name, id, data) {
    const cleanData = {};
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && key !== '_writePromise') {
          cleanData[key] = data[key];
        }
      });
    }
    return firestore.collection(name).doc(id).set(cleanData, { merge: true });
  }

  _attachWritePromise(entry, promise) {
    if (entry && typeof entry === 'object' && promise) {
      Object.defineProperty(entry, '_writePromise', {
        value: promise,
        enumerable: false,
        configurable: true
      });
    }
    return entry;
  }

  remove(name, id) {
    return firestore.collection(name).doc(id).delete();
  }

  // SUGGESTIONS
  getSuggestions() {
    return this.cache.suggestions.map(({ studentName, ...suggestion }) => suggestion);
  }

  addSuggestion(suggestion) {
    const newEntry = {
      id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: 'pending',
      timestamp: Date.now(),
      ...suggestion
    };
    delete newEntry.studentName;
    this.cache.suggestions.unshift(newEntry);
    this.write('suggestions', newEntry.id, newEntry).catch(console.error);
    return newEntry;
  }

  async getClassWeeklySuggestions(studentClass, weekKey) {
    const normClass = String(studentClass || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normClass || !weekKey) return [];
    try {
      const snapshot = await this.withTimeout(
        firestore.collection('suggestions').where('source', '==', 'dt').where('weekKey', '==', weekKey).get(),
        8000
      );
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => String(item.studentClass || '').trim().toUpperCase().replace(/\s+/g, '') === normClass);
    } catch (e) {
      return (this.cache.suggestions || []).filter(item =>
        item.weekKey === weekKey &&
        String(item.studentClass || '').trim().toUpperCase().replace(/\s+/g, '') === normClass
      );
    }
  }

  updateSuggestionStatus(id, status) {
    const index = this.cache.suggestions.findIndex(s => s.id === id);
    if (index !== -1) {
      this.cache.suggestions[index].status = status;
      this.write('suggestions', id, { status }).catch(console.error);
    }
  }

  clearSuggestions() {
    const suggestions = [...this.cache.suggestions];
    this.cache.suggestions = [];
    suggestions.forEach(suggestion => this.remove('suggestions', suggestion.id).catch(console.error));
  }

  // MENSAGENS DA COMUNIDADE
  getMessages() {
    return [...this.cache.messages].sort((a, b) => {
      const aUnread = a.status === 'unread' ? 1 : 0;
      const bUnread = b.status === 'unread' ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  addMessage(message) {
    const newEntry = {
      id: 'msg-' + Date.now(),
      createdAt: Date.now(),
      status: 'unread',
      ...message
    };
    this.cache.messages.unshift(newEntry);
    this.write('messages', newEntry.id, newEntry).catch(console.error);
    return newEntry;
  }

  updateMessageStatus(id, status) {
    const index = this.cache.messages.findIndex(message => message.id === id);
    if (index !== -1) {
      this.cache.messages[index].status = status;
      this.write('messages', id, { status }).catch(console.error);
    }
  }

  deleteMessage(id) {
    this.cache.messages = this.cache.messages.filter(message => message.id !== id);
    this.remove('messages', id).catch(console.error);
  }

  // PODCASTS
  getPodcasts() {
    return [...this.cache.podcasts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  getPodcast(id) {
    return this.cache.podcasts.find(p => p.id === id) || null;
  }

  addPodcast(podcast) {
    const newEntry = { id: 'pod-' + Date.now(), createdAt: Date.now(), ...podcast };
    this.cache.podcasts.unshift(newEntry);
    const writePromise = this.write('podcasts', newEntry.id, newEntry);
    writePromise.catch(console.error);
    return this._attachWritePromise(newEntry, writePromise);
  }

  updatePodcast(id, data) {
    const index = this.cache.podcasts.findIndex(p => p.id === id);
    if (index !== -1) {
      this.cache.podcasts[index] = { ...this.cache.podcasts[index], ...data, updatedAt: Date.now() };
      const writePromise = this.write('podcasts', id, this.cache.podcasts[index]);
      writePromise.catch(console.error);
      return this._attachWritePromise(this.cache.podcasts[index], writePromise);
    }
    return null;
  }

  async savePodcastAsync(podcast) {
    const saved = podcast.id && this.cache.podcasts.some(p => p.id === podcast.id)
      ? this.updatePodcast(podcast.id, podcast)
      : this.addPodcast(podcast);
    if (saved && saved._writePromise) {
      await saved._writePromise;
    }
    return saved;
  }

  deletePodcast(id) {
    this.cache.podcasts = this.cache.podcasts.filter(podcast => podcast.id !== id);
    return this.remove('podcasts', id).catch(console.error);
  }

  // ANNOUNCEMENTS / NOTÍCIAS & ARTIGOS
  getAnnouncements() {
    return [...this.cache.announcements]
      .filter(a => a && a.id !== 'system_maintenance' && a.id !== '__system_maintenance__' && a.isSystemConfig !== true)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map(announcement => ({
        ...announcement,
        category: announcement.category || announcement.tag || 'Notícia',
        tag: announcement.tag || announcement.category || 'Notícia',
        visibility: announcement.visibility === 'internal' || announcement.onAir === true || Boolean(announcement.broadcastDate)
          ? 'internal'
          : 'public',
        image: announcement.image || DEFAULT_ANNOUNCEMENT_IMAGE,
        excerpt: announcement.excerpt || getAnnouncementExcerpt(announcement.content),
        content: announcement.content || `<p>${escapeHtmlForStorage(announcement.excerpt || '')}</p>`
      }));
  }

  // MODO DE MANUTENÇÃO GLOBAL DO SITE (ATIVADO/DESATIVADO EM TEMPO REAL NO ADMIN)
  getSiteMaintenance() {
    const doc = (this.cache.announcements || []).find(a => a && (a.id === 'system_maintenance' || a.id === '__system_maintenance__'));
    const enabled = Boolean(doc && doc.maintenanceEnabled === true);
    const message = String((doc && doc.maintenanceMessage) || '').trim();
    const updatedBy = String((doc && doc.updatedBy) || '').trim();
    const updatedAt = Number(doc && doc.updatedAt) || 0;
    return { enabled, message, updatedBy, updatedAt };
  }

  syncMaintenanceState() {
    const state = this.getSiteMaintenance();
    try {
      localStorage.setItem('radio_cloud_maintenance_active', state.enabled ? '1' : '0');
      localStorage.setItem('radio_cloud_maintenance_msg', state.message || '');
    } catch (_) {}
    document.dispatchEvent(new CustomEvent('radio-maintenance-updated', { detail: state }));
    return state;
  }

  setSiteMaintenance(enabled, options = {}) {
    const id = 'system_maintenance';
    const current = this.getSiteMaintenance();
    const nextMessage = options.message !== undefined ? String(options.message || '').trim() : current.message;
    const entry = {
      id,
      isSystemConfig: true,
      visibility: 'internal',
      maintenanceEnabled: Boolean(enabled),
      maintenanceMessage: nextMessage,
      updatedBy: String(options.updatedBy || current.updatedBy || 'Admin').trim(),
      updatedAt: Date.now()
    };

    if (!this.cache.announcements) this.cache.announcements = [];
    const idx = this.cache.announcements.findIndex(a => a && (a.id === id || a.id === '__system_maintenance__'));
    if (idx === -1) {
      this.cache.announcements.push(entry);
    } else {
      this.cache.announcements[idx] = { ...this.cache.announcements[idx], ...entry, id };
    }

    this.syncMaintenanceState();
    const writePromise = this.write('announcements', id, entry);
    writePromise.catch(console.error);
    // Sincronizar também em siteSettings/maintenance caso as regras tenham sido publicadas
    this.write('siteSettings', 'maintenance', entry).catch(() => {});
    document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: 'siteMaintenance' } }));
    return this._attachWritePromise(entry, writePromise);
  }

  getPublicAnnouncements() {
    return this.getAnnouncements().filter(item => item.visibility !== 'internal' && item.onAir !== true && !item.broadcastDate);
  }

  getInternalAnnouncements() {
    return this.getAnnouncements().filter(item => item.visibility === 'internal' || item.onAir === true || Boolean(item.broadcastDate));
  }

  getAnnouncementById(id) {
    const list = this.getAnnouncements();
    return list.find(a => a.id === id || a.slug === id) || null;
  }

  addAnnouncement(announcement) {
    const isInternal = announcement.visibility === 'internal' || announcement.onAir === true || Boolean(announcement.broadcastDate);
    const newEntry = {
      id: 'ann-' + Date.now(),
      createdAt: Date.now(),
      date: new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
      readTime: '2 min de leitura',
      author: 'Equipa da Rádio • EBS Cidadela',
      image: DEFAULT_ANNOUNCEMENT_IMAGE,
      excerpt: '',
      content: '<p>Escreve o conteúdo deste artigo.</p>',
      visibility: isInternal ? 'internal' : 'public',
      ...announcement,
      visibility: isInternal ? 'internal' : 'public'
    };
    this.cache.announcements.unshift(newEntry);
    const writePromise = this.write('announcements', newEntry.id, newEntry);
    writePromise.catch(console.error);
    return this._attachWritePromise(newEntry, writePromise);
  }

  updateAnnouncement(id, updatedData) {
    const index = this.cache.announcements.findIndex(a => a.id === id);
    if (index !== -1) {
      const normalized = {
        ...this.cache.announcements[index],
        ...updatedData,
        updatedAt: Date.now(),
        visibility: updatedData.visibility === 'internal' || updatedData.onAir === true || Boolean(updatedData.broadcastDate)
          ? 'internal'
          : 'public'
      };
      this.cache.announcements[index] = normalized;
      const writePromise = this.write('announcements', id, normalized);
      writePromise.catch(console.error);
      return this._attachWritePromise(this.cache.announcements[index], writePromise);
    }
    return null;
  }

  saveAnnouncement(announcement) {
    const existingId = announcement.id;
    if (existingId && this.cache.announcements.find(a => a.id === existingId)) {
      return this.updateAnnouncement(existingId, announcement);
    }
    const { id, ...rest } = announcement;
    return this.addAnnouncement(rest);
  }

  async saveAnnouncementAsync(announcement) {
    const saved = this.saveAnnouncement(announcement);
    if (saved && saved._writePromise) {
      await saved._writePromise;
    }
    return saved;
  }

  deleteAnnouncement(id) {
    this.cache.announcements = this.cache.announcements.filter(announcement => announcement.id !== id);
    return this.remove('announcements', id).catch(console.error);
  }

  // LINKTREE LINKS
  getLinks() {
    return [...this.cache.links];
  }

  addLink(link) {
    const newEntry = { id: 'link-' + Date.now(), active: true, createdAt: Date.now(), ...link };
    this.cache.links.push(newEntry);
    this.write('links', newEntry.id, newEntry).catch(console.error);
    return newEntry;
  }

  toggleLink(id) {
    const index = this.cache.links.findIndex(l => l.id === id);
    if (index !== -1) {
      this.cache.links[index].active = !this.cache.links[index].active;
      this.write('links', id, { active: this.cache.links[index].active }).catch(console.error);
    }
  }

  deleteLink(id) {
    this.cache.links = this.cache.links.filter(link => link.id !== id);
    this.remove('links', id).catch(console.error);
  }
  // CALENDÁRIO PARTILHADO
  getCalendarEvents() {
    const customEvents = this.cache.calendarEvents || [];
    const customIds = new Set(customEvents.map(event => event.id));
    return [...customEvents, ...getEditorialCalendarEvents().filter(event => !customIds.has(event.id))].sort((a, b) => {
      const aStart = `${a.date || ''}T${a.startTime || '00:00'}`;
      const bStart = `${b.date || ''}T${b.startTime || '00:00'}`;
      return aStart.localeCompare(bStart);
    });
  }

  saveCalendarEvent(event) {
    const id = event.id || `event-${Date.now()}`;
    const entry = { ...event, id, updatedAt: Date.now() };
    const index = this.cache.calendarEvents.findIndex(item => item.id === id);
    if (index === -1) this.cache.calendarEvents.push(entry);
    else this.cache.calendarEvents[index] = { ...this.cache.calendarEvents[index], ...entry };
    this.write('calendarEvents', id, entry).catch(console.error);
    return entry;
  }

  updateCalendarEventDate(id, date) {
    const index = this.cache.calendarEvents.findIndex(item => item.id === id);
    if (index === -1) return null;
    this.cache.calendarEvents[index] = { ...this.cache.calendarEvents[index], date, updatedAt: Date.now() };
    this.write('calendarEvents', id, { date, updatedAt: Date.now() }).catch(console.error);
    return this.cache.calendarEvents[index];
  }

  deleteCalendarEvent(id) {
    this.cache.calendarEvents = this.cache.calendarEvents.filter(event => event.id !== id);
    this.remove('calendarEvents', id).catch(console.error);
  }

  // UTILIZADORES / ADMINISTRADORES (RBAC)
  getAdminUsers() {
    return [...(this.cache.adminUsers || [])].map(user => {
      // Normalize user with RBAC defaults for backwards compatibility
      const roleKey = user.roleKey || (user.role === 'Administrador' ? 'super_admin' : (user.role || 'super_admin'));
      const permissions = user.permissions || (roleKey === 'super_admin' ? {
        access_aovivo: true,
        manage_rundowns: true,
        manage_songs: true,
        manage_podcasts: true,
        manage_announcements: true,
        manage_links: true,
        manage_messages: true,
        manage_polls: true,
        manage_calendar: true,
        manage_tasks: true,
        manage_memos: true,
        manage_users: true,
        system_config: true
      } : {});

      return {
        ...user,
        roleKey,
        roleTitle: user.roleTitle || (roleKey === 'super_admin' ? 'Super Administrador' : user.role || 'Super Administrador'),
        status: user.status || 'active',
        avatarColor: user.avatarColor || 'indigo',
        position: user.position || 'Membro da Equipa',
        permissions
      };
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt'));
  }

  saveAdminUser(user) {
    const id = user.id || `user-${Date.now()}`;
    const roleKey = user.roleKey || 'super_admin';
    const entry = {
      ...user,
      id,
      roleKey,
      roleTitle: user.roleTitle || 'Super Administrador',
      status: user.status || 'active',
      avatarColor: user.avatarColor || 'indigo',
      position: user.position || 'Membro da Equipa',
      permissions: user.permissions || {},
      updatedAt: Date.now()
    };
    if (!this.cache.adminUsers) this.cache.adminUsers = [];
    const index = this.cache.adminUsers.findIndex(item => item.id === id);
    if (index === -1) this.cache.adminUsers.push(entry);
    else this.cache.adminUsers[index] = { ...this.cache.adminUsers[index], ...entry };
    this.write('adminUsers', id, entry).catch(console.error);
    return entry;
  }

  updateAdminUserStatus(id, status) {
    const user = (this.cache.adminUsers || []).find(u => u.id === id);
    if (user) {
      user.status = status;
      user.updatedAt = Date.now();
      this.write('adminUsers', id, { status, updatedAt: Date.now() }).catch(console.error);
    }
  }

  deleteAdminUser(id) {
    this.cache.adminUsers = (this.cache.adminUsers || []).filter(user => user.id !== id);
    this.remove('adminUsers', id).catch(console.error);
  }

  // GUIÕES & ALINHAMENTOS DE EMISSÃO (RUNDOWNS)
  getRundowns() {
    return [...(this.cache.rundowns || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  getRundownById(id) {
    return (this.cache.rundowns || []).find(r => r.id === id) || null;
  }

  saveRundown(rundown) {
    const id = rundown.id || `rundown-${Date.now()}`;
    const entry = { ...rundown, id, updatedAt: Date.now() };
    if (!this.cache.rundowns) this.cache.rundowns = [];
    const index = this.cache.rundowns.findIndex(item => item.id === id);
    if (index === -1) this.cache.rundowns.unshift(entry);
    else this.cache.rundowns[index] = { ...this.cache.rundowns[index], ...entry };
    this.write('rundowns', id, entry).catch(console.error);
    return entry;
  }

  deleteRundown(id) {
    this.cache.rundowns = (this.cache.rundowns || []).filter(r => r.id !== id);
    this.remove('rundowns', id).catch(console.error);
  }

  getDailyScript(dateKey) {
    if (!this.cache.rundowns) this.cache.rundowns = [];
    const found = this.cache.rundowns.find(r => r.date === dateKey || r.id === `script-${dateKey}` || r.id === dateKey);
    if (found) return found;

    // Generate clean 4-step template if not present
    const content = (typeof generateDefaultScriptTemplate === 'function')
      ? generateDefaultScriptTemplate(dateKey)
      : `[Inicio da Emissão]\n- Bom dia Cidadela! São xx:xx, XºF, ${dateKey}\n\n[Eventos]\nSem eventos hoje\n\n[Avisos]\nSem avisos hoje\n\n[Musica Começa]`;

    return {
      id: `script-${dateKey}`,
      date: dateKey,
      title: `Guião da Emissão`,
      content: content,
      updatedAt: Date.now()
    };
  }

  saveDailyScript(script) {
    const dateKey = script.date || localDateKey(new Date());
    const id = script.id || `script-${dateKey}`;
    const entry = {
      ...script,
      id,
      date: dateKey,
      title: script.title || 'Guião da Emissão',
      content: script.content || '',
      updatedAt: Date.now()
    };
    if (!this.cache.rundowns) this.cache.rundowns = [];
    const index = this.cache.rundowns.findIndex(item => item.id === id || item.date === dateKey);
    if (index === -1) this.cache.rundowns.unshift(entry);
    else this.cache.rundowns[index] = { ...this.cache.rundowns[index], ...entry };
    this.write('rundowns', id, entry).catch(console.error);
    return entry;
  }

  // MURAL DE RECADOS DA EQUIPA (RECADOS DA EQUIPA)
  getTeamMemos() {
    return [...(this.cache.teamMemos || [])].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));
  }

  saveTeamMemo(memo) {
    const id = memo.id || `memo-${Date.now()}`;
    const entry = { ...memo, id, createdAt: memo.createdAt || Date.now(), updatedAt: Date.now() };
    if (!this.cache.teamMemos) this.cache.teamMemos = [];
    const index = this.cache.teamMemos.findIndex(item => item.id === id);
    if (index === -1) this.cache.teamMemos.unshift(entry);
    else this.cache.teamMemos[index] = { ...this.cache.teamMemos[index], ...entry };
    this.write('teamMemos', id, entry).catch(console.error);
    return entry;
  }

  deleteTeamMemo(id) {
    this.cache.teamMemos = (this.cache.teamMemos || []).filter(m => m.id !== id);
    this.remove('teamMemos', id).catch(console.error);
  }

  // ============================================================
  // SONDAGENS / VOTAÇÕES (POLLS)
  // ============================================================
  getPolls() {
    return [...(this.cache.polls || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  savePoll(poll) {
    const id = poll.id || `poll-${Date.now()}`;
    const entry = { ...poll, id, updatedAt: Date.now() };
    if (!this.cache.polls) this.cache.polls = [];
    const index = this.cache.polls.findIndex(item => item.id === id);
    if (index === -1) this.cache.polls.unshift(entry);
    else this.cache.polls[index] = { ...this.cache.polls[index], ...entry };
    this.write('polls', id, entry).catch(console.error);
    return entry;
  }

  deletePoll(id) {
    this.cache.polls = (this.cache.polls || []).filter(p => p.id !== id);
    this.remove('polls', id).catch(console.error);
  }

  closePoll(id) {
    const index = (this.cache.polls || []).findIndex(p => p.id === id);
    if (index !== -1) {
      this.cache.polls[index].closed = true;
      this.cache.polls[index].closedAt = Date.now();
      this.write('polls', id, { closed: true, closedAt: Date.now() }).catch(console.error);
    }
  }

  async addVote(pollId, optionIndex, voterIdentifier) {
    // Hash the voter identifier to avoid storing raw student numbers
    const identHash = await this._hashIdentifier(`${pollId}:${voterIdentifier}`);
    const voteId = `vote-${pollId}-${identHash.slice(0, 12)}`;
    const entry = {
      id: voteId,
      pollId,
      optionIndex,
      voterHash: identHash,
      createdAt: Date.now()
    };
    // Check local de-dup
    return this.write('pollVotes', voteId, entry);
  }

  async checkAlreadyVoted(pollId, voterIdentifier) {
    const identHash = await this._hashIdentifier(`${pollId}:${voterIdentifier}`);
    const voteId = `vote-${pollId}-${identHash.slice(0, 12)}`;
    try {
      const doc = await firestore.collection('pollVotes').doc(voteId).get();
      return doc.exists;
    } catch (e) {
      return false;
    }
  }

  async getPollVoteCounts(pollId) {
    try {
      const snapshot = await firestore.collection('pollVotes').where('pollId', '==', pollId).get();
      const counts = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        counts[data.optionIndex] = (counts[data.optionIndex] || 0) + 1;
      });
      return counts;
    } catch (e) {
      return {};
    }
  }

  async _hashIdentifier(str) {
    if (window.crypto && window.crypto.subtle) {
      try {
        const msgBuffer = new TextEncoder().encode(str);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { }
    }
    // Fallback simples
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  // ============================================================
  // GESTÃO DE TAREFAS (TASKS)
  // ============================================================
  getTasks() {
    return [...(this.cache.tasks || [])].sort((a, b) => {
      // Sort by: priority (urgent first), then by due date, then creation date
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  saveTask(task) {
    const id = task.id || `task-${Date.now()}`;
    const entry = { ...task, id, updatedAt: Date.now() };
    if (!this.cache.tasks) this.cache.tasks = [];
    const index = this.cache.tasks.findIndex(item => item.id === id);
    if (index === -1) this.cache.tasks.unshift(entry);
    else this.cache.tasks[index] = { ...this.cache.tasks[index], ...entry };
    this.write('tasks', id, entry).catch(console.error);
    return entry;
  }

  updateTaskStatus(id, status) {
    const index = (this.cache.tasks || []).findIndex(t => t.id === id);
    if (index !== -1) {
      this.cache.tasks[index].status = status;
      this.cache.tasks[index].updatedAt = Date.now();
      if (status === 'done') this.cache.tasks[index].doneAt = Date.now();
      this.write('tasks', id, { status, updatedAt: Date.now(), ...(status === 'done' ? { doneAt: Date.now() } : {}) }).catch(console.error);
    }
  }

  deleteTask(id) {
    this.cache.tasks = (this.cache.tasks || []).filter(t => t.id !== id);
    this.remove('tasks', id).catch(console.error);
  }

  // ============================================================
  // NERD ALERT — DESAFIOS E SUBMISSÕES DOS ALUNOS
  // ============================================================
  getNerdChallenges() {
    return [...(this.cache.nerdChallenges || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  getActiveNerdChallenge() {
    const activeList = this.getNerdChallenges().filter(c => c.active === true);
    return activeList.length > 0 ? activeList[0] : null;
  }

  saveNerdChallenge(challenge) {
    const id = challenge.id || `nerd-${Date.now()}`;
    if (!this.cache.nerdChallenges) this.cache.nerdChallenges = [];
    const existingIndex = this.cache.nerdChallenges.findIndex(item => item.id === id);
    const existing = existingIndex !== -1 ? this.cache.nerdChallenges[existingIndex] : {};

    const isActive = Boolean(challenge.active);
    const entry = {
      ...existing,
      ...challenge,
      id,
      active: isActive,
      createdAt: existing.createdAt || challenge.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    // Se este desafio ficar ativo, desativa outros desafios ativos para manter 1 desafio em destaque no site
    const otherPromises = [];
    if (isActive) {
      this.cache.nerdChallenges.forEach((item, idx) => {
        if (item.id !== id && item.active) {
          this.cache.nerdChallenges[idx] = { ...item, active: false, updatedAt: Date.now() };
          otherPromises.push(this.write('nerdChallenges', item.id, { active: false, updatedAt: Date.now() }).catch(console.error));
        }
      });
    }

    if (existingIndex === -1) {
      this.cache.nerdChallenges.unshift(entry);
    } else {
      this.cache.nerdChallenges[existingIndex] = entry;
    }

    const writePromise = Promise.all([
      this.write('nerdChallenges', id, entry),
      ...otherPromises
    ]);
    writePromise.catch(console.error);
    document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: 'nerdChallenges' } }));
    return this._attachWritePromise(entry, writePromise);
  }

  toggleNerdChallengeActive(id, forceState) {
    if (!this.cache.nerdChallenges) return null;
    const target = this.cache.nerdChallenges.find(c => c.id === id);
    if (!target) return null;
    const nextActive = typeof forceState === 'boolean' ? forceState : !target.active;
    return this.saveNerdChallenge({ ...target, active: nextActive });
  }

  deleteNerdChallenge(id) {
    this.cache.nerdChallenges = (this.cache.nerdChallenges || []).filter(c => c.id !== id);
    document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: 'nerdChallenges' } }));
    return this.remove('nerdChallenges', id).catch(console.error);
  }

  getNerdSubmissions(challengeId = null) {
    const list = [...(this.cache.nerdSubmissions || [])];
    const filtered = challengeId ? list.filter(s => s.challengeId === challengeId) : list;
    // Ordenação estrita por hora de entrega (ascendente = mais rápido primeiro)
    return filtered.sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
  }

  addNerdSubmission(submission) {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const firstName = String(submission.firstName || '').trim();
    const lastName = String(submission.lastName || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const newEntry = {
      id: `nerdsub-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      challengeId: String(submission.challengeId || '').trim(),
      challengeTitle: String(submission.challengeTitle || '').trim(),
      firstName,
      lastName,
      fullName,
      studentClass: String(submission.studentClass || '').trim().toUpperCase(),
      email: String(submission.email || '').trim().toLowerCase(),
      answer: String(submission.answer || '').trim(),
      submittedAt: nowMs,
      submittedAtIso: nowIso,
      status: 'pending'
    };
    if (!this.cache.nerdSubmissions) this.cache.nerdSubmissions = [];
    this.cache.nerdSubmissions.push(newEntry);
    const writePromise = this.write('nerdSubmissions', newEntry.id, newEntry);
    writePromise.catch(console.error);
    return this._attachWritePromise(newEntry, writePromise);
  }

  updateNerdSubmissionStatus(id, status) {
    if (!this.cache.nerdSubmissions) return null;
    const index = this.cache.nerdSubmissions.findIndex(s => s.id === id);
    if (index !== -1) {
      this.cache.nerdSubmissions[index].status = status;
      this.cache.nerdSubmissions[index].reviewedAt = Date.now();
      this.write('nerdSubmissions', id, { status, reviewedAt: Date.now() }).catch(console.error);
      document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: 'nerdSubmissions' } }));
      return this.cache.nerdSubmissions[index];
    }
    return null;
  }

  deleteNerdSubmission(id) {
    this.cache.nerdSubmissions = (this.cache.nerdSubmissions || []).filter(s => s.id !== id);
    document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: 'nerdSubmissions' } }));
    return this.remove('nerdSubmissions', id).catch(console.error);
  }

  // ============================================================
  // EQUIPA DA RÁDIO (PÁGINA PÚBLICA DE EQUIPA & GESTÃO NO ADMIN)
  // ============================================================
  getTeamMembers() {
    return [...(this.cache.teamMembers || [])].sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 999;
      const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  saveTeamMember(member) {
    const id = member.id || `team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (!this.cache.teamMembers) this.cache.teamMembers = [];
    const existingIndex = this.cache.teamMembers.findIndex(m => m.id === id);
    const existing = existingIndex !== -1 ? this.cache.teamMembers[existingIndex] : {};

    const entry = {
      ...existing,
      ...member,
      id,
      name: String(member.name || '').trim(),
      role: String(member.role || '').trim(),
      photo: String(member.photo !== undefined ? member.photo : (existing.photo || '')).trim(),
      bio: String(member.bio !== undefined ? member.bio : (existing.bio || '')).trim(),
      socialEnabled: Boolean(member.socialEnabled !== undefined ? member.socialEnabled : existing.socialEnabled),
      socialUrl: String(member.socialUrl !== undefined ? member.socialUrl : (existing.socialUrl || '')).trim(),
      order: Number.isFinite(Number(member.order)) ? Number(member.order) : (existing.order ?? (this.cache.teamMembers.length + 1)),
      active: member.active !== false,
      createdAt: existing.createdAt || member.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    if (existingIndex === -1) {
      this.cache.teamMembers.push(entry);
    } else {
      this.cache.teamMembers[existingIndex] = entry;
    }

    const writePromise = this.write('teamMembers', id, entry);
    writePromise.catch(console.error);
    document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: 'teamMembers' } }));
    return this._attachWritePromise(entry, writePromise);
  }

  deleteTeamMember(id) {
    this.cache.teamMembers = (this.cache.teamMembers || []).filter(m => m.id !== id);
    document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: 'teamMembers' } }));
    return this.remove('teamMembers', id).catch(console.error);
  }
}

// Instância Global da Base de Dados
window.db = new RadioDatabase();

function getAnnouncementExcerpt(content) {
  const plainText = String(content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plainText.length > 150 ? `${plainText.slice(0, 147)}...` : plainText;
}

function escapeHtmlForStorage(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================================================
   OFFLINE HOOKS: MONITORIZAÇÃO DE CONECTIVIDADE
   ========================================================================== */

const _onlineStatus = {
  isOnline: navigator.onLine,
  wasOnline: navigator.onLine,
  listeners: [],
  lastChange: Date.now()
};

window.getConnectionStatus = function () {
  return { ..._onlineStatus };
};

window.onConnectionChange = function (callback) {
  if (typeof callback === 'function') {
    _onlineStatus.listeners.push(callback);
  }
  return function unsubscribe() {
    _onlineStatus.listeners = _onlineStatus.listeners.filter(l => l !== callback);
  };
};

function _notifyConnectionChange(isOnline) {
  _onlineStatus.isOnline = isOnline;
  _onlineStatus.lastChange = Date.now();
  _onlineStatus.listeners.forEach(fn => {
    try { fn(isOnline); } catch (_) { }
  });
  document.dispatchEvent(new CustomEvent('radio-connection-change', {
    detail: { online: isOnline, timestamp: Date.now() }
  }));
}

if (window.addEventListener) {
  window.addEventListener('online', () => {
    _notifyConnectionChange(true);
  }, { passive: true });

  window.addEventListener('offline', () => {
    _notifyConnectionChange(false);
  }, { passive: true });
}

window.firebaseServices.online = function () {
  return _onlineStatus.isOnline;
};

window.firebaseServices.onConnectionChange = window.onConnectionChange;
window.firebaseServices.getConnectionStatus = window.getConnectionStatus;

/* ==========================================================================
   CONVERSOR DE IMAGENS (PNG / JPG / WEBP) PARA BASE64 OTIMIZADO (100% GRATUITO)
   Permite alojar fotografias diretamente nos documentos Firestore sem custos
   ========================================================================== */
window.imageFileToBase64 = function (file, options = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !(file instanceof Blob)) {
      reject(new Error('Ficheiro de imagem inválido.'));
      return;
    }
    if (file.type && !file.type.startsWith('image/')) {
      reject(new Error('Seleciona um ficheiro de imagem válido (PNG, JPG, WebP ou GIF).'));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error('A imagem é demasiado grande (máximo 15 MB).'));
      return;
    }

    const maxWidth = options.maxWidth || 1200;
    const maxHeight = options.maxHeight || 1200;
    const initialQuality = options.quality || 0.85;
    const maxBase64Chars = options.maxBase64Chars || 340000; // ~250 KB binários

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro de imagem.'));
    reader.onload = (e) => {
      const rawDataUrl = e.target.result;

      // Se for PNG/JPG/WebP já pequeno (< 140 KB), podemos validar as dimensões e manter direto
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem não suportado pelo navegador.'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (
          rawDataUrl.length <= maxBase64Chars &&
          width <= maxWidth &&
          height <= maxHeight &&
          (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp' || file.type === 'image/gif')
        ) {
          resolve({
            dataUrl: rawDataUrl,
            width,
            height,
            sizeKB: Math.round((rawDataUrl.length * 0.75) / 1024),
            originalName: file.name || 'imagem.png'
          });
          return;
        }

        // Redimensionar mantendo a proporção
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: rawDataUrl,
            width,
            height,
            sizeKB: Math.round((rawDataUrl.length * 0.75) / 1024),
            originalName: file.name || 'imagem.png'
          });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Se o ficheiro original for PNG e couber no limite como PNG, preserva PNG nativo
        let resultDataUrl = '';
        if (file.type === 'image/png') {
          const pngTry = canvas.toDataURL('image/png');
          if (pngTry.length <= maxBase64Chars) {
            resultDataUrl = pngTry;
          }
        }

        // Caso contrário, otimiza com WebP (suporta transparência PNG) ou JPEG progressivamente
        if (!resultDataUrl) {
          let quality = initialQuality;
          resultDataUrl = canvas.toDataURL('image/webp', quality);
          if (!resultDataUrl.startsWith('data:image/webp')) {
            // Fallback para JPEG caso o browser não exporte WebP
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resultDataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          while (resultDataUrl.length > maxBase64Chars && quality > 0.45) {
            quality -= 0.1;
            const mime = resultDataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
            resultDataUrl = canvas.toDataURL(mime, quality);
          }

          // Se mesmo assim for muito grande, reduz ligeiramente a escala
          if (resultDataUrl.length > maxBase64Chars) {
            const scale = 0.75;
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resultDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          }
        }

        resolve({
          dataUrl: resultDataUrl,
          width: canvas.width,
          height: canvas.height,
          sizeKB: Math.max(1, Math.round((resultDataUrl.length * 0.75) / 1024)),
          originalName: file.name || 'imagem.png'
        });
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
};
