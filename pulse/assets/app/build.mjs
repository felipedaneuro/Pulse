import {build} from 'esbuild';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

// Qual configuração entra no bundle (prioridade): --generic > variáveis PULSE_* > src/config.local.mjs > src/config.mjs.
// O bundle versionado no git é sempre o genérico (npm run build:generic): dados da sua conta não vão para o repositório.
const generic=process.argv.includes('--generic'),local=resolve('src/config.local.mjs'),env=process.env;
const fromEnv=!generic&&Boolean(env.PULSE_SUPABASE_URL);
const fromFile=!generic&&!fromEnv&&existsSync(local);

function envConfig(){
 return {mode:'cloud',supabaseUrl:env.PULSE_SUPABASE_URL,publishableKey:env.PULSE_SUPABASE_PUBLISHABLE_KEY||'',workspaceId:env.PULSE_WORKSPACE_ID||'',
  appUrl:env.PULSE_APP_URL||'',templatesBase:env.PULSE_TEMPLATES_BASE||'brand/templates-exemplo',brandThemes:JSON.parse(env.PULSE_BRAND_THEMES||'{}')};
}

const chooseConfig={name:'choose-config',setup(builder){
 builder.onResolve({filter:/(^|\/)config\.mjs$/},args=>{
  if(!args.importer.includes('/src/'))return null;
  if(fromEnv)return {path:'pulse-env-config',namespace:'pulse-config'};
  return fromFile?{path:local}:null;
 });
 builder.onLoad({filter:/.*/,namespace:'pulse-config'},()=>({contents:`export const config=${JSON.stringify(envConfig())};`,loader:'js'}));
}};

console.log(fromEnv?'Build com as variáveis PULSE_*.':fromFile?'Build com src/config.local.mjs.':'Build genérico (src/config.mjs).');
const shared={bundle:true,minify:true,format:'iife',plugins:[chooseConfig]};
await build({...shared,entryPoints:['src/main.js'],outfile:'app.bundle.js'});
await build({...shared,entryPoints:['src/theme-entry.js'],outfile:'theme.bundle.js'});
