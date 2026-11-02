# Registro de alterações

Toda melhoria, ajuste ou reparo entra aqui, no mesmo commit que a muda. Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Adicionado
- **Identidade visual por conta** (`config.brandThemes`): a prévia e o JPEG do carrossel usam as cores, fontes, logo e assinatura da marca.
- **Editor de SVG por campo**: texto reajustado na caixa original, imagem em áreas reservadas com recorte, templates, importar/baixar SVG e exportação em JPEG com fontes embutidas. Lista de permitidos na leitura; bloqueio de sobreposição, de área de imagem vazia e de assinatura ausente.
- **Importação de pasta do banco de pautas** (SVGs, legenda, prompts) ligada aos rascunhos da gaveta.
- **Gaveta de temas**: `pulse/assets/agent/pautas-para-gaveta.py` gera rascunhos sem data a partir de uma planilha.
- Migration `20261102180000_pulse_svg_slides.sql` (upload do SVG editável em `<workspace>/svg/`).
- **Configuração sem editar código**: `src/config.local.mjs` ou variáveis `PULSE_*` no build; `npm run build:generic` para o bundle versionado.
- Segredos `PULSE_APP_ORIGIN` (origem do app nas funções) e `PULSE_APP_URL` substituem a edição de `your-app.example`.
- `scripts/check-public.mjs` e `.githooks/pre-commit` barram dados pessoais e segredos.
- Kit de exemplo neutro (`brand/templates-exemplo/`, `brand/exemplo/`).
- `docs/MANUAL_IMPLEMENTACAO.md` (Supabase, Vercel, Meta, design system, SVG, manutenção) e `CLAUDE.md` do projeto.

### Corrigido
- O painel era remontado a cada 60 s porque a versão carregada vinha de `payload.updated_at` e a checagem comparava com `pulse_datasets.updated_at`; agora espera também enquanto houver edição não salva.
- "Abrir identidade visual" abria o HTML como texto; agora abre em janela isolada.
