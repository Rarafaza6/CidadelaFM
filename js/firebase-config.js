/* ==========================================================================
  RÁDIO EBS CIDADELA - CAMADA DE DADOS FIREBASE
  Os dados da aplicação vivem no Cloud Firestore. O LocalStorage fica reservado
  apenas ao contador diário local de pedidos de música.
  ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyBfy_VtDld7ubowZOClaJ69WiWPnnL3CUo",
  authDomain: "testes-cidadela.firebaseapp.com",
  projectId: "testes-cidadela",
  storageBucket: "testes-cidadela.firebasestorage.app",
  messagingSenderId: "546992842962",
  appId: "1:546992842962:web:55d02c8af60a4ae4f7650b"
};

const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);

const firestore = firebaseApp.firestore();
firestore.settings({ merge: true, ignoreUndefinedProperties: true });
const authInstance = typeof firebaseApp.auth === 'function' ? firebaseApp.auth() : null;
const functionsInstance = typeof firebaseApp.functions === 'function' ? firebaseApp.functions('europe-west1') : null;
window.firebaseServices = {
  app: firebaseApp,
  firestore,
  auth: authInstance,
  functions: functionsInstance
};
window.showFirebaseError = function(container) {
  if (!container) return;
  container.innerHTML = '<div class="firebase-error"><i class="ri-cloud-off-line"></i><strong>Ligação aos conteúdos indisponível.</strong><span>Confirma que o Cloud Firestore está criado e que as regras em <code>firestore.rules</code> foram publicadas.</span></div>';
};
// Dados iniciais de demonstração usados apenas para seed das coleções vazias.
const DEFAULT_PODCASTS = [
  {
    id: "pod-1",
    title: "Entrevista Exclusiva: Associação de Estudantes",
    date: "05 de Setembro, 2026",
    duration: "18:42",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    description: "Conversámos com os membros da AE sobre os projetos e eventos para este ano letivo na EBS da Cidadela."
  },
  {
    id: "pod-2",
    title: "Cultura & Música: Os Maiores Sucessos de Cascais",
    date: "28 de Agosto, 2026",
    duration: "24:15",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    description: "Destaque para os novos talentos musicais do concelho de Cascais e bandas da nossa escola."
  }
];

const DEFAULT_RUNDOWNS = [
  {
    id: "rundown-1",
    title: "Emissão do Intervalo Grande (Exemplo)",
    date: "2026-09-10",
    timeSlot: "10:15 - 10:35",
    hosts: "Equipa da Rádio",
    description: "Alinhamento padrão da manhã com música, aviso da AE e passatempo.",
    blocks: [
      {
        id: "b1",
        type: "jingle",
        title: "Jingle Oficial & Abertura de Emissão",
        body: "Bom dia, EBS Cidadela! São 10 horas e 15 minutos e está no ar a tua Rádio Escolar. Hoje temos as músicas mais pedidas e um aviso importante da Associação de Estudantes.",
        durationSec: 30,
        soundCue: "[JINGLE ENTRA FORTE -> CAMA SONORA]"
      },
      {
        id: "b2",
        type: "aviso",
        title: "Aviso: Inscrições Abertas nos Clubes Escolares",
        body: "Lembramos a todos os alunos do 2.º e 3.º ciclos que as inscrições para os Clubes de Ciência, Teatro e Robótica estão abertas na secretaria e através dos links no nosso site. Não percam a oportunidade de participar!",
        durationSec: 45,
        soundCue: "[CAMA SONORA SUAVE]"
      },
      {
        id: "b3",
        type: "musica",
        title: "Música #1 Mais Pedida pelos Alunos",
        body: "Vamos agora para a música mais votada esta semana pelos alunos da Cidadela no nosso site oficial!",
        durationSec: 180,
        soundCue: "[FADE OUT VOZ -> DISPARAR TRACK #1]"
      },
      {
        id: "b4",
        type: "aviso",
        title: "Passatempo: Adivinha a Música & Ganha um Brinde",
        body: "Atenção: durante o intervalo vamos passar um excerto invertido de uma música. Quem for o primeiro a enviar a resposta correta pela nossa página de mensagens ganha um brinde da Rádio!",
        durationSec: 40,
        soundCue: "[EFEITO SONORO MISTÉRIO / TENSÃO]"
      },
      {
        id: "b5",
        type: "fecho",
        title: "Encerramento da Emissão & Contagem para a Campainha",
        body: "Faltam dois minutos para tocar para as aulas. Obrigado por ouvirem a Rádio Cidadela! Continuem a pedir as vossas músicas para amanhã.",
        durationSec: 30,
        soundCue: "[JINGLE DE FECHO & CRÉDITOS]"
      }
    ],
    updatedAt: Date.now()
  }
];

const DEFAULT_TEAM_MEMOS = [
  {
    id: "memo-1",
    text: "Lembrete: na sexta-feira há entrevista com os delegados de turma às 13h15.",
    author: "Rafael",
    color: "amber",
    pinned: true,
    createdAt: Date.now()
  },
  {
    id: "memo-2",
    text: "Verificar cabos e nível dos auscultadores do microfone 2 antes da emissão.",
    author: "Técnica",
    color: "blue",
    pinned: false,
    createdAt: Date.now() - 3600000
  }
];

const DEFAULT_ANNOUNCEMENTS = [
  {
    id: "ann-1",
    tag: "Recrutamento",
    category: "Recrutamento",
    title: "Inscrições Abertas para a Nova Equipa da Rádio Escolar!",
    date: "08 Setembro, 2026",
    readTime: "3 min de leitura",
    author: "Equipa da Rádio • EBS Cidadela",
    image: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1200&q=80",
    excerpt: "Queres ser locutor, sonoplasta, técnico de som ou criar os teus próprios podcasts na escola? As inscrições estão abertas para todos os alunos.",
    content: `<p>O novo ano letivo já arrancou e com ele chegam muitas novidades à <strong>Rádio Escolar da EBS da Cidadela</strong>! Se és apaixonado por música, comunicação, edição de áudio, jornalismo escolar ou sonoplastia, esta é a tua oportunidade de integrar o nosso projeto oficial.</p>

<h2>Quem pode participar?</h2>
<p>Todos os alunos do 2.º e 3.º ciclos e do Ensino Secundário podem candidatar-se. Não é necessária experiência prévia — terás formação dada pela equipa e pelos professores coordenadores da rádio com o apoio do Agrupamento de Escolas e do Município de Cascais.</p>

<blockquote>"A rádio escolar é o espaço ideal para dares voz às tuas ideias, partilhares os teus gostos musicais e aprenderes a produzir conteúdos reais com tecnologia de estúdio profissional."</blockquote>

<h2>Áreas de Atuação na Rádio:</h2>
<ul>
  <li><strong>Locução & Apresentação:</strong> Condução das emissões ao vivo nos intervalos grandes e no almoço.</li>
  <li><strong>Produção de Podcasts:</strong> Criação de episódios temáticos sobre cinema, desporto, ciência e cultura juvenil.</li>
  <li><strong>Técnica de Som & Mesa de Mistura:</strong> Gestão dos microfones, efeitos sonoros e playlists.</li>
  <li><strong>Redação & Notícias:</strong> Redação dos comunicados escolares e cobertura de eventos da EBS Cidadela.</li>
</ul>

<h2>Como fazer a inscrição?</h2>
<p>Basta acederes à nossa secção de <a href="links.html">Links Rápidos</a> e preencheres o formulário oficial de candidatura online até ao final da próxima semana. As entrevistas e sessões de acolhimento decorrerão no estúdio da rádio no Bloco Central.</p>

<p>Não percas esta oportunidade de fazer a diferença e pôr a tua marca no som da nossa escola!</p>`
  },
  {
    id: "ann-2",
    tag: "Evento",
    category: "Evento",
    title: "Emissão Especial de Receção aos Novos Alunos no Pátio",
    date: "02 Setembro, 2026",
    readTime: "2 min de leitura",
    author: "Redação Rádio Cidadela",
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80",
    excerpt: "Prepara os teus fones e a tua melhor energia! Na próxima sexta-feira teremos uma emissão especial no intervalo grande com música ao vivo e passatempos.",
    content: `<p>Para assinalar o arranque das aulas e dar as boas-vindas a todos os novos alunos que chegam pela primeira vez à Escola Básica e Secundária da Cidadela, a equipa da rádio preparou uma programação muito especial!</p>

<h2>Programação da Emissão:</h2>
<ul>
  <li><strong>10h15 - 10h45 (Intervalo Grande da Manhã):</strong> Transmissão direta no sistema sonoro exterior do pátio principal com os maiores êxitos do verão e as músicas mais pedidas pelos alunos.</li>
  <li><strong>13h00 - 13h40 (Pausa de Almoço):</strong> Apresentação dos clubes escolares, passatempos com ofertas de merchandise da Rádio e entrevistas aos novos delegados de turma.</li>
</ul>

<blockquote>"Queremos que cada aluno sinta que a escola tem uma voz vibrante, jovem e que os acompanha todos os dias."</blockquote>

<p>Não te esqueças: podes pedir as tuas faixas favoritas diretamente aqui no website através do separador <a href="pedir-musica.html">Pedir Música</a>. As 10 músicas mais votadas passarão em direto durante o intervalo!</p>`
  },
  {
    id: "ann-3",
    tag: "Cultura",
    category: "Cultura",
    title: "Inauguração do Novo Espaço de Gravação de Podcasts",
    date: "25 Agosto, 2026",
    readTime: "3 min de leitura",
    author: "Comunicação EBS Cidadela",
    image: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=1200&q=80",
    excerpt: "Com novos microfones profissionais e isolamento acústico renovado, o estúdio da rádio está pronto para novas séries de podcasts.",
    content: `<p>A Rádio Escolar da Cidadela dá mais um salto qualitativo com a recente modernização das suas instalações de gravação. O espaço conta agora com equipamento de áudio de alta fidelidade e uma mesa de mistura digital preparada para transmissões híbridas e gravação multipista.</p>

<h2>O que há de novo no estúdio?</h2>
<ul>
  <li>4 microfones dinâmicos com braços articulados profissionais.</li>
  <li>Mesa de som digital com interface USB direta para estações de edição.</li>
  <li>Espaço de tertúlia preparado para entrevistas a professores, alunos e convidados externos do concelho de Cascais.</li>
</ul>

<p>Fica atento à nossa página de <a href="podcasts.html">Podcasts</a> para ouvires as estreias dos primeiros programas já na primeira quinzena deste mês!</p>`
  }
];

const DEFAULT_ANNOUNCEMENT_IMAGE = 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1200&q=80';

const DEFAULT_LINKS = [
  {
    id: "link-1",
    title: "Inscrições na Equipa da Rádio",
    subtitle: "Junta-te aos nossos locutores e técnicos!",
    url: "https://forms.gle/exemplo-inscricao",
    icon: "ri-mic-line",
    badge: "Aberto",
    active: true
  },
  {
    id: "link-2",
    title: "Formulário de Inquérito de Opinião",
    subtitle: "Que tipo de música queres ouvir no intervalo?",
    url: "https://forms.gle/exemplo-inquerito",
    icon: "ri-file-list-3-line",
    badge: "Sondagem",
    active: true
  },
  {
    id: "link-3",
    title: "Instagram da Rádio Cidadela",
    subtitle: "@radio.cidadela.ebs",
    url: "https://instagram.com",
    icon: "ri-instagram-line",
    badge: "Social",
    active: true
  }
];

const DEFAULT_SUGGESTIONS = [
  {
    id: "sug-1",
    songTitle: "Flowers",
    artist: "Miley Cyrus",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/a2/6a/5d/a26a5d1b-326a-543e-a141-86640db7f95a/23UMGIM00832.rgb.jpg/100x100bb.jpg",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioVideo126/v4/91/25/7a/91257a07-ef02-b258-00aa-a51b54a32629/mzaf_16843468532467554902.plus.aac.p.m4a",
    status: "pending",
    timestamp: Date.now() - 3600000 * 2
  },
  {
    id: "sug-2",
    songTitle: "Flowers",
    artist: "Miley Cyrus",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/a2/6a/5d/a26a5d1b-326a-543e-a141-86640db7f95a/23UMGIM00832.rgb.jpg/100x100bb.jpg",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioVideo126/v4/91/25/7a/91257a07-ef02-b258-00aa-a51b54a32629/mzaf_16843468532467554902.plus.aac.p.m4a",
    status: "pending",
    timestamp: Date.now() - 3600000 * 1
  },
  {
    id: "sug-3",
    songTitle: "As It Was",
    artist: "Harry Styles",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/92/ff/45/92ff45ef-5544-77a8-12d7-dfb1d28fa3f8/886449992523.jpg/100x100bb.jpg",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioVideo112/v4/10/37/10/103710be-0c24-e692-a169-1c9f4e24efbf/mzaf_12351214041180290135.plus.aac.p.m4a",
    status: "played",
    timestamp: Date.now() - 3600000 * 10
  }
];

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
  ['01-04','Dia Mundial do Braille'],['01-24','Dia Internacional da Educação'],['01-26','Dia Internacional da Energia Limpa'],['01-27','Dia Internacional em Memória das Vítimas do Holocausto'],['01-28','Dia Internacional da Coexistência Pacífica'],
  ['02-02','Dia Mundial das Zonas Húmidas'],['02-04','Dia Internacional da Fraternidade Humana'],['02-06','Dia Internacional da Tolerância Zero à Mutilação Genital Feminina'],['02-10','Dia Mundial das Leguminosas'],['02-10','Dia Internacional do Leopardo-Árabe'],['02-11','Dia Internacional das Mulheres e Raparigas na Ciência'],['02-12','Dia Internacional para a Prevenção do Extremismo Violento'],['02-17','Dia Mundial da Resiliência do Turismo'],['02-20','Dia Mundial da Justiça Social'],['02-21','Dia Internacional da Língua Materna'],
  ['03-01','Dia da Discriminação Zero'],['03-01','Dia Mundial das Ervas Marinhas'],['03-03','Dia Mundial da Vida Selvagem'],['03-05','Dia da Sensibilização para o Desarmamento e Não-Proliferação'],['03-08','Dia Internacional da Mulher'],['03-10','Dia Internacional das Mulheres Juízas'],['03-15','Dia Internacional de Combate à Islamofobia'],['03-20','Dia Internacional da Felicidade'],['03-20','Dia da Língua Francesa'],['03-21','Dia Internacional das Florestas'],['03-21','Dia Internacional pela Eliminação da Discriminação Racial'],['03-21','Dia Mundial da Síndrome de Down'],['03-21','Dia Mundial da Água'],['03-22','Dia Mundial da Água'],['03-23','Dia Meteorológico Mundial'],['03-24','Dia Mundial da Tuberculose'],['03-25','Dia Internacional em Memória das Vítimas da Escravatura'],['03-30','Dia Internacional do Lixo Zero'],
  ['04-02','Dia Mundial da Consciencialização do Autismo'],['04-04','Dia Internacional para Sensibilização sobre Minas'],['04-05','Dia Internacional da Consciência'],['04-06','Dia Internacional do Desporto para o Desenvolvimento e a Paz'],['04-07','Dia Mundial da Saúde'],['04-12','Dia Internacional do Voo Espacial Humano'],['04-14','Dia Mundial da Doença de Chagas'],['04-15','Dia Internacional do Bem-Estar'],['04-20','Dia da Língua Chinesa'],['04-21','Dia Mundial da Criatividade e Inovação'],['04-22','Dia Internacional da Mãe Terra'],['04-23','Dia Internacional das Raparigas nas TIC'],['04-23','Dia Mundial do Livro e dos Direitos de Autor'],['04-23','Dia da Língua Inglesa'],['04-23','Dia da Língua Espanhola'],['04-25','Dia Mundial da Malária'],['04-26','Dia Mundial da Propriedade Intelectual'],['04-28','Dia Mundial da Segurança e Saúde no Trabalho'],
  ['05-02','Dia Mundial do Atum'],['05-03','Dia Mundial da Liberdade de Imprensa'],['05-05','Dia Mundial da Língua Portuguesa'],['05-08','Dia de Memória e Reconciliação pelas vítimas da Segunda Guerra Mundial'],['05-10','Dia Internacional da Argania'],['05-12','Dia Internacional da Saúde das Plantas'],['05-15','Dia Internacional das Famílias'],['05-16','Dia Internacional da Luz'],['05-17','Dia Mundial das Telecomunicações e da Sociedade da Informação'],['05-19','Dia Mundial do Fair Play'],['05-20','Dia Mundial das Abelhas'],['05-21','Dia Internacional do Chá'],['05-22','Dia Internacional da Biodiversidade'],['05-25','Dia Mundial do Futebol'],['05-29','Dia Internacional dos Capacetes Azuis da ONU'],['05-30','Dia Internacional da Batata'],['05-31','Dia Mundial sem Tabaco'],
  ['06-01','Dia Global dos Pais'],['06-03','Dia Mundial da Bicicleta'],['06-04','Dia Internacional das Crianças Vítimas Inocentes de Agressão'],['06-05','Dia Mundial do Ambiente'],['06-07','Dia Mundial da Segurança dos Alimentos'],['06-08','Dia Mundial dos Oceanos'],['06-10','Dia Internacional do Diálogo entre Civilizações'],['06-11','Dia Internacional do Brincar'],['06-12','Dia Mundial contra o Trabalho Infantil'],['06-13','Dia Internacional da Consciencialização sobre o Albinismo'],['06-14','Dia Mundial do Dador de Sangue'],['06-15','Dia Mundial de Consciencialização da Violência contra a Pessoa Idosa'],['06-16','Dia Internacional das Remessas Familiares'],['06-17','Dia Mundial de Combate à Desertificação e Seca'],['06-18','Dia da Gastronomia Sustentável'],['06-19','Dia Internacional para a Eliminação da Violência Sexual em Conflito'],['06-20','Dia Mundial do Refugiado'],['06-21','Dia Internacional do Yoga'],['06-23','Dia das Nações Unidas para o Serviço Público'],['06-24','Dia Internacional das Mulheres na Diplomacia'],['06-25','Dia do Marinheiro'],['06-26','Dia Internacional contra o Abuso e Tráfico Ilícito de Drogas'],['06-27','Dia das Micro, Pequenas e Médias Empresas'],['06-29','Dia Internacional dos Trópicos'],['06-30','Dia Internacional dos Asteroides'],
  ['07-05','Dia Internacional das Cooperativas'],['07-06','Dia Mundial do Desenvolvimento Rural'],['07-07','Dia Mundial da Língua Kiswahili'],['07-11','Dia Mundial da População'],['07-12','Dia Internacional da Esperança'],['07-15','Dia Mundial das Competências dos Jovens'],['07-18','Dia Internacional Nelson Mandela'],['07-20','Dia Mundial do Xadrez'],['07-20','Dia Internacional da Lua'],['07-25','Dia Mundial de Prevenção do Afogamento'],['07-28','Dia Mundial das Hepatites'],['07-30','Dia Internacional da Amizade'],['07-30','Dia Mundial contra o Tráfico de Pessoas'],
  ['08-01','Início da Semana Mundial do Aleitamento Materno'],['08-09','Dia Internacional dos Povos Indígenas'],['08-11','Dia Mundial do Steelpan'],['08-19','Dia Mundial Humanitário'],['08-21','Dia Internacional de Homenagem às Vítimas do Terrorismo'],['08-23','Dia Internacional de Memória do Tráfico de Escravos e sua Abolição'],['08-27','Dia Mundial dos Lagos'],['08-29','Dia Internacional contra os Ensaios Nucleares'],['08-30','Dia Internacional das Vítimas de Desaparecimentos Forçados'],
  ['09-05','Dia Internacional da Caridade'],['09-07','Dia Internacional do Ar Limpo para Céus Azuis'],['09-08','Dia Internacional da Literacia'],['09-09','Dia Internacional para Proteger a Educação contra Ataques'],['09-15','Dia Internacional da Democracia'],['09-16','Dia Internacional para a Preservação da Camada de Ozono'],['09-17','Dia Mundial da Segurança do Doente'],['09-18','Dia Internacional da Igualdade Salarial'],['09-20','Dia Mundial da Limpeza'],['09-21','Dia Internacional da Paz'],['09-23','Dia Internacional das Línguas Gestuais'],['09-27','Dia Mundial do Turismo'],['09-28','Dia Internacional do Acesso Universal à Informação'],['09-29','Dia Internacional de Consciencialização sobre Perdas e Desperdício Alimentar'],['09-30','Dia Internacional da Tradução'],
  ['10-01','Dia Internacional das Pessoas Idosas'],['10-02','Dia Internacional da Não Violência'],['10-05','Dia Mundial do Professor'],['10-07','Dia Mundial do Algodão'],['10-09','Dia Mundial dos Correios'],['10-10','Dia Mundial da Saúde Mental'],['10-11','Dia Internacional da Rapariga'],['10-13','Dia Internacional para a Redução do Risco de Catástrofes'],['10-15','Dia Internacional das Mulheres Rurais'],['10-16','Dia Mundial da Alimentação'],['10-17','Dia Internacional para a Erradicação da Pobreza'],['10-24','Dia das Nações Unidas'],['10-24','Dia Mundial da Informação sobre Desenvolvimento'],['10-27','Dia Mundial do Património Audiovisual'],['10-29','Dia Internacional dos Cuidados e Apoio'],['10-31','Dia Mundial das Cidades'],
  ['11-02','Dia Internacional pelo Fim da Impunidade dos Crimes contra Jornalistas'],['11-05','Dia Mundial de Consciencialização sobre Tsunamis'],['11-10','Dia Mundial da Ciência para a Paz e o Desenvolvimento'],['11-14','Dia Mundial da Diabetes'],['11-16','Dia Internacional da Tolerância'],['11-19','Dia Mundial da Sanita'],['11-20','Dia Mundial da Criança'],['11-21','Dia Mundial da Televisão'],['11-25','Dia Internacional pela Eliminação da Violência contra as Mulheres'],['11-26','Dia Mundial do Transporte Sustentável'],['11-29','Dia Internacional de Solidariedade com o Povo Palestiniano'],['11-30','Dia de Memória de Todas as Vítimas de Guerra Química'],
  ['12-01','Dia Mundial de Luta contra a Sida'],['12-02','Dia Internacional para a Abolição da Escravatura'],['12-03','Dia Internacional das Pessoas com Deficiência'],['12-04','Dia Internacional dos Bancos'],['12-05','Dia Mundial do Solo'],['12-05','Dia Internacional do Voluntariado'],['12-07','Dia Internacional da Aviação Civil'],['12-09','Dia Internacional contra a Corrupção'],['12-10','Dia dos Direitos Humanos'],['12-11','Dia Internacional das Montanhas'],['12-12','Dia Internacional da Cobertura Universal de Saúde'],['12-18','Dia Internacional dos Migrantes'],['12-20','Dia Internacional da Solidariedade Humana'],['12-21','Dia Mundial da Meditação'],['12-21','Dia Mundial do Basquetebol'],['12-27','Dia Internacional de Preparação para Epidemias']
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
  const fixed = [['01-01','Ano Novo'],['04-25','Dia da Liberdade'],['05-01','Dia do Trabalhador'],['06-10','Dia de Portugal, de Camões e das Comunidades Portuguesas'],['08-15','Assunção de Nossa Senhora'],['10-05','Implantação da República'],['11-01','Dia de Todos-os-Santos'],['12-01','Restauração da Independência'],['12-08','Imaculada Conceição'],['12-25','Natal']];
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
      suggestions: [],
      messages: [],
      calendarEvents: [],
      adminUsers: [],
      rundowns: [],
      teamMemos: []
    };
    this.error = null;
    this.readyPromise = this.initialize();
  }

  async initialize() {
    try {
      await Promise.all([
        this.loadCollection('podcasts', DEFAULT_PODCASTS),
        this.loadCollection('announcements', DEFAULT_ANNOUNCEMENTS),
        this.loadCollection('links', DEFAULT_LINKS)
      ]);
      this.watchCollections(['podcasts', 'announcements', 'links']);
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
      this.loadCollection('adminUsers', [])
    ]);
    this.watchCollections(['suggestions', 'messages', 'rundowns', 'teamMemos', 'calendarEvents', 'adminUsers']);
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
          this.cache[name] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    return firestore.collection(name).doc(id).set(data, { merge: true });
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
      id: 'sug-' + Date.now(),
      status: 'pending',
      timestamp: Date.now(),
      ...suggestion
    };
    delete newEntry.studentName;
    this.cache.suggestions.unshift(newEntry);
    this.write('suggestions', newEntry.id, newEntry).catch(console.error);
    return newEntry;
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

  addPodcast(podcast) {
    const newEntry = { id: 'pod-' + Date.now(), createdAt: Date.now(), ...podcast };
    this.cache.podcasts.unshift(newEntry);
    this.write('podcasts', newEntry.id, newEntry).catch(console.error);
    return newEntry;
  }

  deletePodcast(id) {
    this.cache.podcasts = this.cache.podcasts.filter(podcast => podcast.id !== id);
    this.remove('podcasts', id).catch(console.error);
  }

  // ANNOUNCEMENTS / NOTÍCIAS & ARTIGOS
  getAnnouncements() {
    return [...this.cache.announcements].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(announcement => ({
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
    this.write('announcements', newEntry.id, newEntry).catch(console.error);
    return newEntry;
  }

  updateAnnouncement(id, updatedData) {
    const index = this.cache.announcements.findIndex(a => a.id === id);
    if (index !== -1) {
      const normalized = {
        ...this.cache.announcements[index],
        ...updatedData,
        visibility: updatedData.visibility === 'internal' || updatedData.onAir === true || Boolean(updatedData.broadcastDate)
          ? 'internal'
          : 'public'
      };
      this.cache.announcements[index] = normalized;
      this.write('announcements', id, normalized).catch(console.error);
      return this.cache.announcements[index];
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

  deleteAnnouncement(id) {
    this.cache.announcements = this.cache.announcements.filter(announcement => announcement.id !== id);
    this.remove('announcements', id).catch(console.error);
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

  // UTILIZADORES / ADMINISTRADORES (perfil usado na agenda partilhada)
  getAdminUsers() {
    return [...this.cache.adminUsers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt'));
  }

  saveAdminUser(user) {
    const id = user.id || `user-${Date.now()}`;
    const entry = { ...user, id, role: 'Administrador', updatedAt: Date.now() };
    const index = this.cache.adminUsers.findIndex(item => item.id === id);
    if (index === -1) this.cache.adminUsers.push(entry);
    else this.cache.adminUsers[index] = { ...this.cache.adminUsers[index], ...entry };
    this.write('adminUsers', id, entry).catch(console.error);
    return entry;
  }

  deleteAdminUser(id) {
    this.cache.adminUsers = this.cache.adminUsers.filter(user => user.id !== id);
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

  // MURAL DE RECADOS DA EQUIPA (TEAM NOTION MEMOS)
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
