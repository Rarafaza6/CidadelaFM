# Votação Rádio Wave — Deploy

## Ficheiros a publicar (manter a estrutura)
```
voto.html                  (atalho na raiz, usa votação/wave-core.js e logos/)
logos/logo1..6.png         (usados por voto.html)
votação/index.html         → voto público
votação/equipa.html        → voto da equipa (palavra-passe)
votação/resultados.html    → resultados e gestão (palavra-passe)
votação/admin.html         → cópia de resultados.html
votação/wave-core.js       → Firebase + contador (OBRIGATÓRIO)
votação/logos/logo1..6.png
```
`votação/firestore.rules` NÃO é para publicar no site: cola-se na consola do Firebase.

## Firebase (projeto `cidadelafm`) — fazer 1 vez
1. Build → **Firestore Database** → Criar base de dados (modo produção).
2. Firestore → **Regras** → colar `votação/firestore.rules` → Publicar.
   (Se o projeto tiver outras regras, copiar só o bloco `match /votacao_2026/wave`.)
3. Authentication → Settings → **Authorized domains** → adicionar o domínio do site.

## Teste antes do dia oficial
1. `index.html`: votar por N.º de processo → deve mostrar "Voto Registado".
   Recarregar → continua trancado, sem mostrar a escolha.
2. Votar de novo com o mesmo N.º noutro browser → deve ser recusado.
3. `equipa.html`: votar com um nome → boletim aparece anónimo no painel.
4. `resultados.html` (OlhaAOnda1): confirmar votos, pódio, eliminar o voto de teste.
5. Apagar os dados de teste na consola (coleção `votacao_2026/wave/*`) antes de abrir ao público.

## Fecho
Automático a 26/out/2026 às 15:00 (hora de Portugal): o contador chega a zero, o formulário
fecha e as regras do Firestore recusam novos votos.
