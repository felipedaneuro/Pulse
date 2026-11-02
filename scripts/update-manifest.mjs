#!/usr/bin/env node
// Mantém pulse/MANIFEST.sha256 igual ao conteúdo que será commitado (índice do git).
// Uso: node scripts/update-manifest.mjs          reescreve o manifesto
//      node scripts/update-manifest.mjs --check  só confere (usado no gancho pre-commit)
import {execSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),manifest=resolve(root,'pulse/MANIFEST.sha256');
const run=args=>execSync(`git ${args}`,{cwd:root,maxBuffer:1<<28});
const paths=run('ls-files -z pulse/').toString('utf8').split('\0').filter(Boolean).filter(path=>path!=='pulse/MANIFEST.sha256').sort();
const lines=paths.map(path=>`${createHash('sha256').update(run(`show :${path}`)).digest('hex')}  ${path.replace(/^pulse\//,'')}`);
const expected=lines.join('\n')+'\n';

if(process.argv.includes('--check')){
 const current=existsSync(manifest)?readFileSync(manifest,'utf8'):'';
 if(current!==expected){console.error('MANIFEST.sha256 desatualizado. Rode: node scripts/update-manifest.mjs e adicione o arquivo ao commit.');process.exit(1);}
 console.log(`manifesto em dia (${lines.length} arquivos).`);
}else{
 writeFileSync(manifest,expected);console.log(`pulse/MANIFEST.sha256 reescrito (${lines.length} arquivos).`);
}
