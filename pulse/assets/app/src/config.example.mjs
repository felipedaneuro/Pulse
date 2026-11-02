// Modelo de configuração. Copie para src/config.local.mjs (ignorado pelo git) e preencha com os dados do SEU projeto.
// Alternativa sem arquivo: defina PULSE_SUPABASE_URL, PULSE_SUPABASE_PUBLISHABLE_KEY, PULSE_WORKSPACE_ID, PULSE_APP_URL,
// PULSE_TEMPLATES_BASE e PULSE_BRAND_THEMES (JSON) no ambiente do build (por exemplo, nas variáveis do projeto na Vercel).
// Nada daqui é segredo: a chave é a PUBLICAVEL. A chave de serviço (service_role/secret) NUNCA entra neste arquivo.
export const config={
 mode:'cloud',
 supabaseUrl:'https://SEU_PROJETO.supabase.co',
 publishableKey:'sb_publishable_...',
 workspaceId:'uuid-do-workspace',
 appUrl:'https://seu-app.vercel.app',
 // Pasta dos templates de slide em SVG. 'brand/templates-exemplo' acompanha o repositório; use a sua própria pasta para a sua marca.
 templatesBase:'brand/templates-exemplo',
 // Visual dos slides por conta editorial. A chave é o account_key da conta (tabela pulse_editorial_accounts).
 brandThemes:{
  'conta-exemplo':{
   kicker:'SUA ESPECIALIDADE',handle:'@seu.perfil',signature:'REGISTRO PROFISSIONAL · NÚMERO',
   // Texto obrigatório na capa e no último slide. A exportação em JPEG é bloqueada sem ele. Deixe [] se não houver exigência.
   requiredText:[],
   fonts:{display:'Poppins',text:'Inter'},
   colors:{dark:'#1F2A44',light:'#F4F4F2',gold:'#B8893B',white:'#FFFFFF',ink:'#1F2A44',soft:'#586174'},
   logos:{dark:'brand/exemplo/logo-icone-escuro.svg',light:'brand/exemplo/logo-icone-claro.svg'}
  }
 }
};
