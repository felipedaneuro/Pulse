# Manual de implementação do Pulse

Do zero até o Pulse publicando no Instagram, com a sua marca. Este manual cobre: repositório, Supabase, Vercel, app da Meta, design system, artes em SVG, importação do banco de pautas e a rotina de manutenção.

> **Regra de ouro de privacidade.** O repositório é público e genérico. Tudo que é seu (URL do projeto, IDs, @, número de registro profissional, logos, templates da marca, dados coletados) vive **fora do git**. A seção 2 explica como, e o `npm run check:public` barra o commit se algo escapar.

**Tempo estimado:** 2 a 3 horas na primeira vez, sendo a maior parte a aprovação do app da Meta.

## Sumário
1. [Visão geral e pré-requisitos](#1-visão-geral-e-pré-requisitos)
2. [Repositório, configuração e privacidade](#2-repositório-configuração-e-privacidade)
3. [Supabase](#3-supabase)
4. [Vercel](#4-vercel)
5. [App da Meta (Instagram)](#5-app-da-meta-instagram)
6. [Design system](#6-design-system)
7. [Artes em SVG](#7-artes-em-svg)
8. [Banco de pautas e gaveta de temas](#8-banco-de-pautas-e-gaveta-de-temas)
9. [Rotina de publicação e segurança](#9-rotina-de-publicação-e-segurança)
10. [Manter, melhorar e contribuir](#10-manter-melhorar-e-contribuir)
11. [Problemas conhecidos](#11-problemas-conhecidos)
12. [Checklist final](#12-checklist-final)

---

## 1. Visão geral e pré-requisitos

```
Navegador (SPA estática na Vercel)
   │  chave PUBLICÁVEL + sessão do usuário
   ▼
Supabase ── Auth (e-mail) ── Postgres (RLS) ── Storage privado "pulse-private"
   │             └─ pg_cron → Edge Functions: pulse-publisher · pulse-editorial · pulse-meta-connect · pulse-team-admin
   ▼                                              │ chave de SERVIÇO (só no servidor)
Meta Graph API (Instagram) ◄──────────────────────┘
```

| Parte | Onde fica | É segredo? |
|---|---|---|
| URL do projeto, chave **publicável**, ID do workspace | dentro do bundle do app | Não (é pública por desenho) |
| Chave **de serviço** (`service_role`/secret) | só nas Edge Functions e em `.env` local do agente | **Sim, nunca no git, chat ou navegador** |
| ID e segredo do app da Meta | segredos das Edge Functions | **Sim** |
| Imagens, SVGs editáveis, manual de marca, dados coletados | Storage privado | Sim (acesso só do dono) |

**Contas e ferramentas:** GitHub, [Supabase](https://supabase.com), [Vercel](https://vercel.com), [Meta for Developers](https://developers.facebook.com) e uma conta **profissional** do Instagram ligada a um portfólio empresarial. Node 20 ou superior. Opcionais: Supabase CLI e Vercel CLI (`npx vercel`).

---

## 2. Repositório, configuração e privacidade

```bash
git clone https://github.com/SEU_USUARIO/Pulse.git && cd Pulse
git config core.hooksPath .githooks          # ativa o bloqueio de dados pessoais no commit
cd pulse/assets/app && npm install
```

### Como a sua configuração entra no app (prioridade do `npm run build`)
1. `--generic` (`npm run build:generic`): ignora tudo e usa `src/config.mjs` (modo local, vazio). **É o bundle que vai para o git.**
2. Variáveis `PULSE_*` no ambiente do build (ideal para deploy por Git na Vercel).
3. `src/config.local.mjs` (ignorado pelo git): copie `src/config.example.mjs` e preencha.
4. `src/config.mjs`.

Variáveis aceitas: `PULSE_SUPABASE_URL`, `PULSE_SUPABASE_PUBLISHABLE_KEY`, `PULSE_WORKSPACE_ID`, `PULSE_APP_URL`, `PULSE_TEMPLATES_BASE` e `PULSE_BRAND_THEMES` (JSON com o mesmo formato de `brandThemes`).

### O que nunca vai para o git (já está no `.gitignore`)
`src/config.local.mjs` · `brand/identidade/` (manual e logos da sua marca) · `brand/templates/` (templates da sua marca) · `brand/capas/` · `pulse-dataset-*.json` · `.mcp.json` · `.claude/` · `.agents/`.

### Verificação antes de publicar
```bash
node scripts/check-public.mjs      # ou: cd pulse/assets/app && npm run check:public
```
Ele lê os valores da **sua** `config.local.mjs` e procura cada um nos arquivos versionados, além de padrões de segredo (URL de projeto Supabase, chaves `sb_publishable_`/`sb_secret_`, JWT, `SUPABASE_SERVICE_ROLE_KEY=`, número de CRM real). O gancho `.githooks/pre-commit` roda isso a cada commit.

---

## 3. Supabase

### 3.1 Projeto e chaves
1. Crie um projeto (região próxima do público; guarde a senha do banco).
2. **Project Settings → API Keys**: copie a **Project URL** e a chave **publicável** (`sb_publishable_…`) para `config.local.mjs`. A chave de serviço fica no painel; não a copie para lugar nenhum além dos segredos das funções.

### 3.2 Banco de dados
No **SQL Editor** (ou `supabase db push`), aplique nesta ordem a partir de `pulse/assets/backend/`:
1. `schema.sql` (tabelas, RLS e o bucket privado `pulse-private`)
2. `team-access.sql`
3. `idea-progress.sql`
4. `migrations/*.sql` **em ordem de nome**.

**Antes das migrations de cron** (`…150100_pulse_publisher_cron.sql`, `…180000_pulse_meta_unified_login.sql`, `…223015_pulse_editorial_cron.sql`), troque `YOUR_PROJECT` pelo *project ref* (o trecho antes de `.supabase.co`):
```bash
sed -i '' 's/YOUR_PROJECT/SEU_REF/g' pulse/assets/backend/migrations/*.sql   # Linux: sed -i sem ''
```
Elas ativam `pg_cron`, `pg_net` e o Vault. Aplique-as **depois** de publicar as funções (seção 3.5). Não commite os arquivos com o ref preenchido (o `check:public` avisa).

A migration `…_pulse_svg_slides.sql` libera o upload do SVG editável em `<workspace>/svg/…`.

### 3.3 Autenticação
**Authentication → Providers**: habilite *Email*. Em **URL Configuration**: *Site URL* = o endereço do app; *Redirect URLs* = `https://SEU_APP/**`. O dono precisa ter o **e-mail confirmado**: as regras de acesso editorial exigem isso e recusam contas anônimas.

### 3.4 Dono, workspace e primeira conta editorial
1. Crie o usuário dono (Authentication → Users → *Add user*, com e-mail confirmado).
2. Crie o workspace e a base inicial: veja [`pulse/references/private-access.md`](../pulse/references/private-access.md) e [`data-model.md`](../pulse/references/data-model.md).
   ```sql
   insert into public.pulse_workspaces(id,owner_id,handle,title)
   values (gen_random_uuid(),'UUID_DO_DONO','seu.perfil','Pulse') returning id;
   ```
   Copie o `id` para `workspaceId` da configuração.
3. Cadastre a conta editorial (o `account_key` é a chave do tema de marca; o `instagram_handle` precisa ser **exatamente** o @ que a Meta devolver, senão a conexão falha com "O @ compartilhado não é o desta conta"):
   ```sql
   insert into public.pulse_editorial_accounts(workspace_id,account_key,name,instagram_handle)
   values ('ID_DO_WORKSPACE','seu-perfil','Nome exibido','seu.perfil') returning id;
   ```

### 3.5 Edge Functions
Funções: `pulse-publisher` (publica e faz o cron), `pulse-editorial` (resultados e CRM), `pulse-meta-connect` (login da Meta) e `pulse-team-admin` (acessos). Todas com **verificação de JWT desligada** (`--no-verify-jwt`): o cron e o retorno da Meta não carregam JWT, e cada handler valida a própria autenticação.

**Com a Supabase CLI** (a pasta `_shared` precisa ficar ao lado das funções):
```bash
supabase init && mkdir -p supabase/functions
cp -R pulse/assets/backend/functions/* supabase/functions/
supabase link --project-ref SEU_REF
for f in pulse-publisher pulse-editorial pulse-meta-connect pulse-team-admin; do supabase functions deploy $f --no-verify-jwt; done
```
**Pelo painel/MCP:** envie cada função com cópias locais de `supabase-rest.mjs` e `instagram-graph.mjs`, trocando `../_shared/` por `./` nos imports.

**Segredos** (Edge Functions → Secrets, ou `supabase secrets set`):

| Segredo | Valor |
|---|---|
| `PULSE_APP_ORIGIN` | endereço do app, sem barra final (CORS e retorno do login) |
| `PULSE_META_APP_ID` · `PULSE_META_APP_SECRET` | do app da Meta (seção 5) |
| `PULSE_META_CONFIG_ID` | ID da configuração do Login do Facebook para Empresas |
| `PULSE_META_REDIRECT_URI` | `https://SEU_REF.supabase.co/functions/v1/pulse-meta-connect` |
| `PULSE_META_GRAPH_VERSION` | opcional (padrão `v26.0`) |
| `PULSE_CRM_URL` · `PULSE_CRM_KEY` | opcionais, para o CRM |

### 3.6 Conferência
```sql
select count(*) from information_schema.tables where table_schema='public' and table_name like 'pulse\_%';  -- espere 12
select jobname, schedule from cron.job;                                                                      -- pulse-publisher, pulse-editorial-results
select id, public from storage.buckets where id='pulse-private';                                            -- public = false
```
No app: **Publicação** deve listar a conta, sem o aviso "Não foi possível carregar as contas de publicação" (esse aviso significa migrations faltando).

---

## 4. Vercel

1. **Add New → Project** a partir do seu fork. *Root Directory* = `pulse/assets/app`. O `vercel.json` já define `buildCommand: npm run build` e `outputDirectory: .`.
2. **Escolha como a configuração chega ao build:**
   - *Deploy por Git:* defina as variáveis `PULSE_*` do projeto (seção 2). Os arquivos da sua marca precisam estar no repositório (no **seu** fork, remova-os do `.gitignore`) ou use o kit de exemplo.
   - *Deploy pela CLI* (usa `src/config.local.mjs` e a pasta `brand/` locais, que não estão no git):
     ```bash
     cd pulse/assets/app && npx vercel link && npx vercel deploy --prod
     ```
3. `.vercelignore` já exclui `brand/capas` e o manual de identidade (lido do Storage privado, não de endereço público).
4. Confira: abra o app, entre com o dono e a aba **Publicação** deve carregar a conta.

> Deploy gera custo e vai para produção: faça só quando decidir.

---

## 5. App da Meta (Instagram)

> Os nomes de menu da Meta mudam; os conceitos abaixo vêm do que o código (`pulse-meta-connect`) exige.

1. Em [developers.facebook.com/apps](https://developers.facebook.com/apps) crie um app do tipo **Business**.
2. Adicione o produto **Login do Facebook para Empresas** e crie uma **Configuração**: tipo de token **token de usuário do sistema da empresa**; permissões de publicação no Instagram (o código aceita `instagram_content_publish` ou `instagram_business_content_publish`) e, para métricas, as permissões de Insights. Copie o **ID da configuração** → `PULSE_META_CONFIG_ID`.
3. Em **URIs de redirecionamento do OAuth válidos** coloque exatamente `https://SEU_REF.supabase.co/functions/v1/pulse-meta-connect` (igual ao segredo `PULSE_META_REDIRECT_URI`, sem barra final).
4. **Configurações do app → Básico**: copie *ID do aplicativo* → `PULSE_META_APP_ID` e *Chave secreta* → `PULSE_META_APP_SECRET`. A chave secreta vai direto para o painel do Supabase, nunca para chat ou git.
5. A conta do Instagram precisa ser **profissional** e estar compartilhada com o portfólio empresarial que fizer o login.
6. Modo **Desenvolvimento**: só quem tem função no app (admin, desenvolvedor, testador) conecta. Para contas de terceiros é preciso a **Revisão do app** da Meta.
7. No Pulse: **Publicação → Conexão e equipe → Conectar Instagram**. Se a Meta ainda não mostrar o @ compartilhado, use **Retomar conexão** depois de conferir *Configurações do negócio → Contas do Instagram*.
8. Antes do primeiro agendamento, use **Testar sem publicar**.

---

## 6. Design system

A identidade vive em dados (sem código) e vale na prévia e no JPEG exportado.

### 6.1 Tokens
Defina o mínimo: **duas superfícies** (escura e clara), **uma cor de acento**, cor do texto e do texto secundário, e **duas famílias** (título e texto). O app traz Poppins e Inter (licença OFL, em `brand/fonts/`). Para outras fontes, adicione os `.ttf` e um `@font-face` em `publication.css`; a exportação embute as fontes pelo nome `brand/fonts/<família>-<peso>.ttf` (pesos conhecidos em `svg-render.mjs`).

Regras de contraste (WCAG) a respeitar no seu conjunto: acento sobre a superfície escura só em texto grande (≥ 32 px) se a razão for menor que 4,5:1; acento sobre superfície clara só em linhas e formas, nunca texto; botão de acento leva texto escuro; texto secundário nunca em cinza claro sobre fundo claro.

### 6.2 Tema por conta (`brandThemes` em `config.local.mjs`)
```js
brandThemes:{ 'seu-perfil':{            // = account_key
  kicker:'SUA ESPECIALIDADE', handle:'@seu.perfil', signature:'REGISTRO PROFISSIONAL · NÚMERO',
  requiredText:['REGISTRO PROFISSIONAL'],   // exigido na capa e no último slide; [] se não houver
  fonts:{display:'Poppins',text:'Inter'},
  colors:{dark:'#…',light:'#…',gold:'#…',white:'#FFFFFF',ink:'#…',soft:'#…'},
  logos:{dark:'brand/…/logo-icone-escuro.svg',light:'brand/…/logo-icone-claro.svg'}  // proporção 946×1380
}}
```
Sem tema para a conta, o Pulse usa o visual padrão dos slides. Veja `src/config.example.mjs` e `brand/exemplo/`.

### 6.3 Layout dos slides (grade 1080 × 1350, margem 88 px)
Capa e fechamento em superfície escura (diagonal de acento, kicker, gancho 82/92 px, apoio, rodapé com @ e registro profissional); miolo em superfície clara (régua de acento, número do slide, título 58/68 px, corpo 38/55 px). Se o seu registro profissional é obrigatório por norma do seu conselho, mantenha-o em todo slide de capa e fechamento e use `requiredText`.

---

## 7. Artes em SVG

### 7.1 Editor dentro do Pulse
Em **Criar post**, cada slide pode ter uma arte em SVG: texto por campo (as quebras de linha são refeitas dentro da caixa original), imagem nas áreas reservadas (recorte e zoom), template da marca, **Importar SVG** e **Baixar SVG**. A exportação sai em JPEG 1080 × 1350 com as fontes embutidas e o resultado alimenta o fluxo normal de testar e agendar. O SVG editável fica no Storage (`<workspace>/svg/<post>/<lote>/slide-NN.svg`), uma versão nova a cada salvamento.

Proteções: a leitura aceita só uma lista de elementos e atributos (sem script, `foreignObject`, link externo ou estilo); campos de assinatura e valores de gráfico ficam travados; texto que passe a invadir outro elemento avisa e **bloqueia a exportação**; área de imagem vazia e guias de template bloqueiam/saem da exportação; formatos fora de 4:5 avisam que não entram em carrossel.

### 7.2 Contrato para criar SVGs compatíveis
| Item | Regra |
|---|---|
| Tamanho | `viewBox="0 0 1080 1350"` (carrossel); `1080×1920` só para capa de Reels/Stories |
| Texto | elementos `<text>` com `<tspan x y>` por linha; **nunca em curvas**; `font-family`, `font-weight`, `font-size` explícitos |
| IDs de campo | `kicker`, `hook`, `apoio`, `titulo`, `corpo`, `subtitulo`, `texto-destaque`, `numero-slide`, `item-N-texto`, `chamada`, `badge-texto`, `rodape-arroba`, `arroba`… (rótulos em `svg-edit-core.mjs`) |
| Travados | `destaque`, `barra-N-valor` (ligados a gráfico gerado) e `rodape-crm`, `crm-rqe` (assinatura) |
| Área de imagem | `<g id="PLACEHOLDER-IMAGEM">` com um `<rect>` e um `<text id="PLACEHOLDER-IMAGEM-rotulo">` |
| Guias | `<g id="guias-NAO-EXPORTAR">` é removido na exportação |
| Elementos | `svg g defs rect circle line path text tspan image pattern clipPath title` |

### 7.3 Kit de exemplo e kit próprio
`brand/templates-exemplo/` (oito templates neutros: capa, conteúdo, lista, alerta, artigo, CTA, Reels, YouTube) e `brand/exemplo/` (logo genérico) acompanham o repositório. Para a sua marca, crie `brand/templates/` e `brand/identidade/` (ignorados pelo git) e aponte `templatesBase` e `logos` na configuração.

### 7.4 Importar um banco de SVGs já produzido
Estrutura aceita (uma pasta por pauta; o prefixo `ID-` liga a pasta ao rascunho da gaveta):
```
banco/ANE-01-risco-de-ruptura/01-capa.svg  02-…svg  legenda.txt  conteudo.json  PROMPTS-IMAGEM.md  primeiro-comentario.txt
```
`ID` casa com `^[A-Z][A-Z0-9]{0,3}-\d{2}-` (ex.: `ANE-01-`, `L1-06-`). `conteudo.json` pode ter `status` e `aviso`. No Pulse: **Criar post → Importar pasta do banco (SVG)** e escolha a pasta raiz. Cada pauta recebe os SVGs, a legenda no lugar do CTA provisório e os prompts de imagem; rascunhos antigos viram nova versão (histórico preservado). Pautas sem rascunho correspondente são listadas como ignoradas.

---

## 8. Banco de pautas e gaveta de temas

A **gaveta** é um conjunto de rascunhos sem data na etapa *Ideia*, para alocar depois no calendário. Nada é agendado nem aprovado.

```bash
python3 pulse/assets/agent/pautas-para-gaveta.py PLANILHA.xlsx ID_DA_CONTA_EDITORIAL ./saida
# cole saida/lote1.sql, lote2.sql… no SQL Editor do Supabase
```
A planilha precisa de uma aba **Banco de pautas** com as colunas `ID`, `Tema`, `Linha`, `Público-alvo`, `Formato`, `Pauta (título de trabalho)`, `Gancho…`, `Estrutura do conteúdo` (partes separadas por ` · `, ex.: `S1 gancho · S2 …`), `CTA…`, `Métrica que conta`, `Âncora de evidência`, `Confiança`, `Ressalva de confiança`, `Assinatura…`, `Risco…`, `Status`; e, opcionalmente, uma aba **Fontes** (`Autor / origem`, `Título`, `DOI`, `Pautas que dependem dela`). Gancho e estrutura viram os slides, o CTA vira a legenda provisória e o DOI vira a fonte. Os ids são determinísticos: rodar de novo não duplica. Os campos de conferência (confiança, assinatura, risco, bloqueios) ficam nos detalhes de cada post.

Para achar a gaveta no app: **Criar post → Campanha → "Gaveta · …"** ou **Biblioteca**.

---

## 9. Rotina de publicação e segurança

1. Crie ou importe → revise o texto, as fontes e o texto alternativo → **Salvar** → mova a etapa até *Em revisão*.
2. **Testar sem publicar** (monta o carrossel no Instagram e para antes de publicar).
3. **Agendar publicação automática** (entre 2 minutos e 120 dias). Alterar o texto depois cancela o agendamento; um post publicado fica travado.
4. O cron do banco acorda a função `pulse-publisher` a cada minuto, só quando há trabalho. Falha de resposta da Meta nunca repete a publicação às cegas: há reconciliação.

**Segurança:** a chave de serviço e o segredo da Meta ficam só nos segredos das funções; troque-os se vazarem. RLS limita tudo ao dono do workspace. Conteúdo de saúde exige a assinatura do profissional antes de publicar; o Pulse bloqueia a exportação sem o texto exigido em `requiredText`, mas **a responsabilidade clínica e regulatória é sua**.

---

## 10. Manter, melhorar e contribuir

O repositório é a fonte única: a sua instalação é o mesmo código com a sua configuração por fora. Por isso toda melhoria, ajuste ou reparo vai **para o repositório**, nunca só para a sua instalação.

**Fluxo de cada mudança**
1. Altere o código e rode `npm test` (e os testes das funções: `node --test pulse/assets/backend/functions/*/handler.test.mjs`).
2. Mudou o banco? Crie um arquivo em `backend/migrations/` **e** aplique-o no seu Supabase (os dois sempre juntos).
3. Mudou o que alguém precisa configurar? Atualize **este manual**.
4. Registre no [`CHANGELOG.md`](../CHANGELOG.md).
5. `npm run build:generic`, `node scripts/check-public.mjs` e `node scripts/update-manifest.mjs` (atualiza `pulse/MANIFEST.sha256`; o gancho recusa o commit se estiver velho), depois commit no padrão `feat:`/`fix:`/`docs:`/`refactor:`/`chore:`/`test:`/`style:`.
6. `git push`. O deploy da **sua** instalação é um passo à parte (`npm run build` com a sua configuração, ou push se usar Git na Vercel).

**Receber melhorias de outros:** `git remote add upstream <repositório original>` e `git merge upstream/main`. A sua configuração fica de fora, então não há conflito.

---

## 11. Problemas conhecidos

| Sintoma | Causa | Solução |
|---|---|---|
| "Não foi possível carregar as contas de publicação" | migrations da publicação não aplicadas | seção 3.2; confira com 3.6 |
| "Origem não permitida" nas funções | `PULSE_APP_ORIGIN` ausente ou diferente do endereço do app | defina o segredo, sem barra final |
| Conectar Instagram diz que a Meta não foi configurada | faltam `PULSE_META_*` | seção 3.5 e 5 |
| "O @ compartilhado não é o desta conta" | `instagram_handle` difere do @ real | corrija na tabela `pulse_editorial_accounts` |
| "Abrir identidade visual" mostrava código | o Storage serve HTML como texto | corrigido: o app baixa e mostra em janela isolada |
| A tela voltava à Visão geral sozinha | comparação entre `payload.updated_at` e `pulse_datasets.updated_at` | corrigido no `cloud-main.js`; recarregue com Cmd+Shift+R |
| Texto do SVG sobrepõe outro elemento | campo alongado demais | o editor avisa e bloqueia o JPEG: encurte o campo |
| JPEG com fonte errada | fonte sem arquivo em `brand/fonts/` | adicione `<família>-<peso>.ttf` |
| `apply_migration` expira em 2 minutos (via MCP) | a confirmação interativa não foi respondida | reenvie e confirme logo, ou use `supabase db push` |
| Capas somem no site | a pasta `brand/capas` não é publicada (vêm do Storage) | normal no modo nuvem |

---

## 12. Checklist final

- [ ] Fork clonado, `core.hooksPath` ativo, `npm install` feito
- [ ] Projeto Supabase criado; URL e chave publicável em `config.local.mjs`
- [ ] `schema.sql`, `team-access.sql`, `idea-progress.sql` e migrations aplicados (3.6 confere)
- [ ] Auth configurado; dono com e-mail confirmado; workspace e conta editorial criados
- [ ] 4 funções publicadas sem JWT; segredos definidos; cron ativo
- [ ] Projeto Vercel com raiz `pulse/assets/app`; deploy feito
- [ ] App da Meta criado; redirecionamento igual ao segredo; Instagram conectado e testado sem publicar
- [ ] Tema de marca, logos, fontes e templates próprios configurados
- [ ] (Opcional) banco de SVGs importado e gaveta carregada
- [ ] `node scripts/check-public.mjs` sem ocorrências antes do primeiro push
