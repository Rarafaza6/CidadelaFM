# 📻 Rádio Escolar EBS da Cidadela

Plataforma Web Oficial e Sistema de Gestão para a **Rádio Escolar da Escola Básica e Secundária da Cidadela**, desenvolvida em parceria com a **Câmara Municipal de Cascais**.

O projeto é 100% gratuito permanentemente e desenhado para ser alojado diretamente no **GitHub Pages**.

---

## ✨ Funcionalidades Principais

- 🎵 **Sugestão de Músicas em Tempo Real (Alunos)**:
  - Pesquisa direta e instantânea com capas de álbum e títulos usando a **API de Música Gratuita do iTunes**.
  - Os alunos podem enviar pedidos de música com o seu nome ou de forma anónima.
  - **Privacidade total**: Os alunos **NÃO vêm** as sugestões uns dos outros.
- 🏆 **Painel de Controlo & Ranking de Músicas (Admin)**:
  - Agregação automática das músicas mais sugeridas pelos alunos com contagem de pedidos (*#1 mais pedida*, *#2*, etc.).
  - Ações para ouvir prévia, marcar música como "Tocado na Rádio" ou arquivar.
- 🔗 **Hub Linktree Integrado (`/links.html`)**:
  - Página leve e otimizada para smartphones para locutores anunciarem no ar (*ex: "Alunos, acedam a radio-cidadela.pt/links para se inscreverem"*).
  - Os botões (Formulários, Inscrições, Redes Sociais) são totalmente geridos pelo Painel Admin.
- 🎙️ **Podcasts & Leitor de Áudio**:
  - Leitor integrado na página principal para ouvir emissões especiais, entrevistas e conteúdos criados na escola.
- 📢 **Mural de Anúncios & Notícias**:
  - Publicação de avisos, eventos e recrutamento para a equipa da rádio.
  - Cartões editoriais com capas, filtros e pesquisa em `noticias.html`.
  - Leitura individual em `artigo.html?id=...` com partilha, impressão e artigos relacionados.
  - Editor rico estilo Word em `admin-editor.html`, com criação e edição de artigos, formatação, capas e pré-visualização.
- 📅 **Calendário Partilhado da Equipa**:
  - Agenda privada em tempo real na área reservada, com criação, edição e eliminação de eventos.
  - Atribuição opcional de cada compromisso a um membro da equipa.
- 🗓️ **Centro de Operações Diário**:
  - O painel abre num briefing de “Hoje”, com eventos do dia, preparação da semana, mensagens recentes e avisos para levar ao ar.
  - O calendário inclui uma seleção recorrente de dias temáticos e memórias musicais para inspirar a programação.
- ✍️ **Guiões de Antena no Editor Integrado**:
  - A partir do briefing, é possível abrir um guião pré-preenchido com as efemérides e eventos da data.
  - Os artigos podem ser marcados como “Aviso para ler em antena” e associados a uma data, para aparecerem no briefing certo.- 👥 **Gestão de Utilizadores da Agenda**:
  - Criação, alteração e eliminação de perfis com nome e email, usados para identificar os responsáveis no calendário.
  - Todos os perfis são administradores; todas as contas autenticadas mantêm acesso integral ao painel.- 🏛️ **Parceria CMC**:
  - Nota de rodapé integrada e elegante reconhecendo a parceria com a Câmara Municipal de Cascais.

---

## 🚀 Como Alojar no GitHub Pages (100% Grátis)

1. Cria um repositório no teu GitHub (ex: `radio-cidadela`).
2. Envia os ficheiros deste projeto para o repositório.
3. No GitHub, vai a **Settings** > **Pages**.
4. Em **Build and deployment**, escolhe a branch `main` e a pasta `/ (root)`.
5. Clica em **Save**. Em 1 minuto o teu website estará online no endereço `https://teu-utilizador.github.io/radio-cidadela`.

---

## 🔐 Firebase e Segurança

Os dados são guardados no **Cloud Firestore**. O `LocalStorage` é usado apenas para contar os pedidos de música feitos pelo mesmo dispositivo no próprio dia.

1. Ativa o Firestore e o Firebase Authentication com Email/Password no projeto Firebase.
2. Cria a base de dados Firestore `default` numa região europeia.
3. Cria as contas da equipa no Firebase Authentication.
4. Publica as regras de [firestore.rules](firestore.rules).
5. Não coloques credenciais de utilizadores ou chaves privadas no frontend.

As coleções públicas permitem leitura de podcasts, notícias e links. As coleções privadas `calendarEvents` e `adminUsers` são acessíveis apenas a contas autenticadas. Sugestões e mensagens só permitem criação anónima com validação de campos; leitura, edição e eliminação exigem qualquer conta autenticada no Firebase. O painel usa sessão Firebase, sem PIN hardcoded.

---

## 🔐 Acesso ao Painel de Administração

- Acede a `admin.html` (ou clica em "Admin" no menu do site).
- As contas são criadas e geridas no Firebase Authentication. O site não disponibiliza registo público.
- Qualquer conta criada no Firebase Authentication pode entrar no painel.
