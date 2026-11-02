// Importação da pasta "banco de pautas": liga os SVGs, a legenda e os prompts de cada pauta ao rascunho já criado na gaveta.
import {mainTitle} from './svg-edit-core.mjs';
import {parseSvg,serializeSvg} from './svg-render.mjs';
import {planning} from './publication-planning.mjs';

const FOLDER_ID=/^([A-Z][A-Z0-9]{0,3}-\d{2})-/;
const MAX_CAPTION=2200,MAX_ORIGIN=18000;
const byName=(a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true});
const TEXT_FILES={'legenda.txt':'caption','conteudo.json':'content','PROMPTS-IMAGEM.md':'prompts','primeiro-comentario.txt':'comment'};

// One group per pauta folder (ANE-01-…). Duplicated copies of the same pauta: the one with more SVGs, then the shallower one.
export function groupBankFiles(files){
 const folders=new Map();
 for(const file of files){
  const parts=(file.webkitRelativePath||file.name).split('/');
  const match=parts.length>1?FOLDER_ID.exec(parts[parts.length-2]):null;
  if(!match)continue;
  const key=parts.slice(0,-1).join('/'),group=folders.get(key)||{id:match[1],folder:parts[parts.length-2],depth:parts.length,svgs:[],texts:{}};
  if(/\.svg$/i.test(file.name))group.svgs.push(file);
  else if(TEXT_FILES[file.name])group.texts[TEXT_FILES[file.name]]=file;
  folders.set(key,group);
 }
 const best=new Map();
 for(const group of folders.values()){
  const current=best.get(group.id);
  if(!current||group.svgs.length>current.svgs.length||(group.svgs.length===current.svgs.length&&group.depth<current.depth))best.set(group.id,group);
 }
 return [...best.values()].map(group=>({...group,svgs:group.svgs.sort(byName)})).sort((a,b)=>a.id.localeCompare(b.id,'pt-BR',{numeric:true}));
}

const clip=(value,size)=>typeof value==='string'&&value.trim()?value.trim().slice(0,size):undefined;

// Carousels take their slides from the SVGs. A single art (Reel cover, photo) replaces only the first slide and keeps the rest of the script.
export function applyBankImport(post,{paths,titles,caption,prompts,content,comment,folder}){
 const next=structuredClone(post),slides=titles.map((title,index)=>({headline:(title||`Slide ${index+1}`).slice(0,120),body:'',alt:`Slide ${index+1}: ${title||'arte do slide'}`.slice(0,500)}));
 next.content.slides=slides.length>=2?slides:[slides[0],...post.content.slides.slice(1)];
 if(caption&&caption.length<=MAX_CAPTION)next.content.caption=caption;
 const extra=Object.fromEntries(Object.entries({imagePrompts:clip(prompts,6000),produced:clip(content?.status,200),notice:clip(content?.aviso,800),firstComment:clip(comment,1000),bankFolder:folder}).filter(([,value])=>value));
 next.origin={...(post.origin||{}),svg:{slides:paths.map(path=>({path})),source:'banco-de-pautas'},planning:{...planning(post),...extra}};
 if(JSON.stringify(next.origin).length>MAX_ORIGIN)next.origin.planning.imagePrompts=clip(prompts,1500);
 next.status='draft';next.planned_at=null;
 return next;
}

async function readText(file){return file?file.text():'';}
async function readJson(file){try{return file?JSON.parse(await file.text()):null;}catch{return null;}}

async function readSvgs(files){
 const items=[],problems=[];
 for(const file of files){
  try{const root=parseSvg(await file.text());items.push({text:serializeSvg(root),title:mainTitle(root)});}
  catch(error){problems.push(`${file.name}: ${error.message}`);}
 }
 return {items,problems};
}

export async function importBank({files,rows,repository,onProgress=()=>{}}){
 const groups=groupBankFiles(files),saved=[],skipped=[];
 for(const [position,group] of groups.entries()){
  const post=rows.find(row=>planning(row).pautaId===group.id);
  if(!post){skipped.push({id:group.id,reason:'não há rascunho dessa pauta na gaveta'});continue;}
  onProgress(`Importando ${group.id} (${position+1} de ${groups.length})…`);
  const {items,problems}=await readSvgs(group.svgs);
  if(!items.length){skipped.push({id:group.id,reason:problems[0]||'sem SVG'});continue;}
  const paths=await repository.uploadSvgs(post,items.map((item,index)=>({index,text:item.text})));
  const [caption,prompts,comment,content]=await Promise.all([readText(group.texts.caption),readText(group.texts.prompts),readText(group.texts.comment),readJson(group.texts.content)]);
  const candidate=applyBankImport(post,{paths,titles:items.map(item=>item.title),caption:caption.trim(),prompts,content,comment,folder:group.folder});
  saved.push(await repository.save(candidate));
  if(problems.length)skipped.push({id:group.id,reason:`${problems.length} SVG ignorado(s): ${problems[0]}`});
 }
 return {saved,skipped};
}
