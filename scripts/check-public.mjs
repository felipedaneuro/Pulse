#!/usr/bin/env node
// Barra dados pessoais antes de publicar. Procura, nos arquivos versionados, os valores da SUA configuração
// (pulse/assets/app/src/config.local.mjs, se existir) e padrões de segredo. Roda no gancho .githooks/pre-commit.
import {execSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname,extname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const BINARY=new Set(['.ttf','.png','.jpg','.jpeg','.webp','.pdf','.zip','.mp4','.ico']);
const PATTERNS=[
 ['URL de projeto Supabase',/https:\/\/[a-z0-9]{20}\.supabase\.co/g],
 ['chave publicável',/sb_publishable_[A-Za-z0-9_-]{16,}/g],
 ['chave secreta',/sb_secret_[A-Za-z0-9_-]{16,}/g],
 ['token JWT',/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
 ['chave de serviço atribuída',/SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S{20,}/g],
 ['segredo do app Meta atribuído',/PULSE_META_APP_SECRET\s*=\s*\S{8,}/g],
 ['número de CRM real',/CRM-[A-Z]{2}\s*(?!0+\b)\d{3,}/g]
];

async function personalValues(){
 const file=resolve(root,'pulse/assets/app/src/config.local.mjs');
 if(!existsSync(file))return [];
 const {config}=await import(pathToFileURL(file).href),values=new Set();
 const add=value=>{if(typeof value==='string'&&value.length>=6)values.add(value);};
 for(const key of ['supabaseUrl','publishableKey','workspaceId','appUrl'])add(config[key]);
 if(config.supabaseUrl)add(new URL(config.supabaseUrl).hostname);
 for(const theme of Object.values(config.brandThemes||{})){add(theme.handle);add(theme.signature);(theme.requiredText||[]).forEach(add);}
 return [...values];
}

const files=execSync('git ls-files -z',{cwd:root,encoding:'utf8',maxBuffer:1<<28}).split('\0').filter(Boolean).filter(file=>!BINARY.has(extname(file).toLowerCase())&&existsSync(resolve(root,file)));
const personal=await personalValues(),findings=[];
for(const file of files){
 const lines=readFileSync(resolve(root,file),'utf8').split('\n');
 lines.forEach((line,index)=>{
  for(const [name,pattern] of PATTERNS)if(new RegExp(pattern.source).test(line))findings.push(`${file}:${index+1}  ${name}`);
  for(const value of personal)if(line.includes(value))findings.push(`${file}:${index+1}  valor da sua configuração (${value.slice(0,4)}…)`);
 });
}
if(findings.length){
 console.error(`check-public: ${findings.length} ocorrência(s) de dado pessoal ou segredo em arquivos versionados:\n`+[...new Set(findings)].slice(0,40).map(item=>' - '+item).join('\n'));
 console.error('\nMova o dado para src/config.local.mjs (ignorado pelo git) e gere o bundle com: npm run build:generic');
 process.exit(1);
}
console.log(`check-public: ${files.length} arquivos conferidos, nenhum dado pessoal ou segredo encontrado.`);
