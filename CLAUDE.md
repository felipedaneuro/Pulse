# Pulse — instruções do projeto

Repositório **público e replicável**. Leia `docs/MANUAL_IMPLEMENTACAO.md` antes de mudar configuração, banco, funções ou marca.

## Privacidade (inegociável)
- Nenhum dado pessoal vai para o git: URL de projeto Supabase, chaves, IDs de workspace/conta, @, registro profissional, logos e templates da marca, dados coletados, backups. Tudo isso vive em `pulse/assets/app/src/config.local.mjs` e nas pastas ignoradas (ver `.gitignore`).
- Antes de **todo commit**: `cd pulse/assets/app && npm run build:generic` `node scripts/check-public.mjs` e, depois do `git add`, `node scripts/update-manifest.mjs` (reescreve `pulse/MANIFEST.sha256`). O gancho `.githooks/pre-commit` confere os dois (`git config core.hooksPath .githooks`).
- O `app.bundle.js` versionado é sempre o **genérico**. Nunca commite o bundle gerado com `config.local.mjs` ou variáveis `PULSE_*`.
- Chave de serviço, segredo do app da Meta e senhas nunca entram em arquivo, chat ou commit.

## Toda mudança fica ligada ao repositório
1. Código + testes (`npm test` em `pulse/assets/app`; `node --test pulse/assets/backend/functions/*/handler.test.mjs`).
2. Mudança no banco = arquivo novo em `pulse/assets/backend/migrations/` **e** aplicação no Supabase da instalação, juntos.
3. Mudança que exige configuração = atualizar `docs/MANUAL_IMPLEMENTACAO.md`.
4. Registrar no `CHANGELOG.md` (seção *Não lançado*).
5. Commit no padrão `feat:`/`fix:`/`docs:`/`refactor:`/`chore:`/`test:`/`style:`, com diff revisável.

## Operação
- Deploy só quando o dono pedir explicitamente (gera custo). Deploy pela CLI (`npx vercel deploy --prod`, a partir de `pulse/assets/app`): a Vercel refaz o build lá com o `config.local.mjs` enviado, então **não** gere o bundle pessoal localmente. Se gerar (`npm run build`, só para testar), rode `npm run build:generic` antes de qualquer commit: o gancho recusa o bundle com dados pessoais.
- Responder em português do Brasil. Estilo do código: nomes descritivos em inglês, funções curtas, sem `console.log`, sem TODO solto.
- Conteúdo de saúde: nada é publicado sem a assinatura do profissional; não contornar os bloqueios do editor (`requiredText`, sobreposição, área de imagem vazia).
