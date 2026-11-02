// Configuração padrão: modo local, sem conta online. Para usar com a sua conta, veja docs/MANUAL_IMPLEMENTACAO.md
// (arquivo src/config.local.mjs ou variáveis PULSE_* no build). Use somente a chave PUBLICAVEL: uma chave privilegiada nunca entra aqui.
export const config={mode:'local',supabaseUrl:'',publishableKey:'',workspaceId:'',appUrl:globalThis.location?.origin||'',templatesBase:'brand/templates-exemplo',brandThemes:{}};
