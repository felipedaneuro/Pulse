// Editor de slides em SVG dentro do Pulse: texto por campo, imagem nas áreas reservadas, template e exportação em JPEG.
import {fieldsOf,placeholdersOf,mainTitle,signatureIssue,layoutWarning,labelFor} from './svg-edit-core.mjs';
import {parseSvg,serializeSvg,applyText,loadFieldFonts,viewBoxOf,svgToJpeg,collisionPairs} from './svg-render.mjs';
import {readPicture,cropToDataUri,picturesOf,placePicture,restorePlaceholder} from './svg-image.mjs';

export const TEMPLATES=[['capa','Capa'],['conteudo','Conteúdo'],['lista','Lista'],['alerta','Alerta'],['artigo','Artigo da semana'],['cta','Chamada final (CTA)'],['reels','Capa de Reels (9:16)'],['youtube','Miniatura do YouTube']];
const slidesOf=post=>post?.origin?.svg?.slides||[];
const uid=()=>Math.random().toString(36).slice(2,8);

export function createSvgSlides({repository,esc,onChange,templatesBase='brand/templates-exemplo'}){
 const docs=new Map(),enabled=Boolean(repository.downloadSvg&&repository.uploadSvgs);
 let token=0,version=0,crop=null;
 const keyOf=(post,index)=>`${post.id}:${index}`;
 // The panel is rebuilt after each save, when the open post is replaced by the saved row.
 const panelKey=(post,index,prefix='')=>`${prefix}${keyOf(post,index)}:${post.revision}:${version}`;
 const has=(post,index)=>enabled&&Boolean(slidesOf(post)[index]);

 async function fetchTemplate(name){
  if(!TEMPLATES.some(([id])=>id===name))throw Error('Template desconhecido.');
  const response=await fetch(`${templatesBase}/${name}.svg`);
  if(!response.ok)throw Error('Não foi possível abrir o template.');
  return parseSvg(await response.text());
 }

 const newDoc=(root,path)=>({root,path,dirty:!path,baseline:collisionPairs(root),overlaps:[]});

 // Puts an SVG (template or imported file) in a slide; the art is saved with the post on the next save.
 function assign(post,index,entry,root){
  post.origin={...(post.origin||{}),svg:{...(post.origin?.svg||{}),slides:[...slidesOf(post)]}};
  while(post.origin.svg.slides.length<index)post.origin.svg.slides.push(null);
  post.origin.svg.slides[index]=entry;
  docs.set(keyOf(post,index),newDoc(root,null));version++;onChange();
 }

 async function docFor(post,index){
  const key=keyOf(post,index);
  if(docs.has(key))return docs.get(key);
  const entry=slidesOf(post)[index];
  const root=entry.path?parseSvg(await repository.downloadSvg(entry.path)):await fetchTemplate(entry.template);
  await loadFieldFonts(root);
  const doc=newDoc(root,entry.path||null);
  docs.set(key,doc);
  return doc;
 }

 function paint(preview,doc){
  const clone=document.importNode(doc.root,true);
  clone.removeAttribute('width');clone.removeAttribute('height');clone.setAttribute('role','img');
  preview.replaceChildren(clone);
 }

 // Locked fields are read-only, not disabled: the editor's lock() re-enables every disabled control when it finishes.
 function fieldHtml(field,index){
  const rows=field.text.length>90?4:2;
  return `<label class="${field.locked?'is-locked':''}">${esc(field.label)}<textarea rows="${rows}" data-field="${index}" ${field.locked?'readonly':''}>${esc(field.text)}</textarea>${field.locked?`<small>${esc(field.lockReason)}</small>`:''}</label>`;
 }

 const templateOptions=()=>'<option value="">Escolha um template…</option>'+TEMPLATES.map(([id,name])=>`<option value="${id}">${name}</option>`).join('');

 function bindTemplate(panel,post,index){
  panel.querySelector('[data-apply-template]').onclick=async()=>{
   const name=panel.querySelector('[data-template]').value;
   if(!name)return;
   if(has(post,index)&&!window.confirm('Trocar a arte deste slide pelo template? O texto e a imagem atuais serão descartados.'))return;
   const root=await fetchTemplate(name);await loadFieldFonts(root);
   assign(post,index,{path:null,template:name},root);
  };
 }

 function bindImport(panel,post,index){
  panel.querySelector('[data-import]').onchange=async event=>{
   const file=event.target.files[0];event.target.value='';
   if(!file)return;
   try{
    const root=parseSvg(await file.text());await loadFieldFonts(root);
    assign(post,index,{path:null,imported:file.name.slice(0,120)},root);
   }catch(error){panel.querySelector('.svg-warning').textContent=error.message;}
  };
 }

 const importButton='<label class="text-button upload">Importar SVG<input type="file" accept=".svg,image/svg+xml" data-import hidden></label>';

 function notice(panel,message){panel.querySelector('.svg-warning').textContent=message;}

 // New overlaps are those that did not exist when the art was opened; they block the export until the text is shortened.
 function checkOverlaps(doc){
  doc.overlaps=[...collisionPairs(doc.root)].filter(key=>!doc.baseline.has(key));
  return doc.overlaps.length?`O texto encosta em: ${doc.overlaps.map(key=>key.split('|').map(id=>/^imagem-/.test(id)?'área da imagem':labelFor(id)).join(' × ')).join('; ')}. Encurte o campo.`:'';
 }

 function bindFields(panel,preview,doc,fields){
  const box=viewBoxOf(doc.root);
  panel.querySelectorAll('[data-field]').forEach(area=>{
   area.oninput=()=>{
    try{
     const result=applyText(fields[Number(area.dataset.field)].node,area.value,box);
     notice(panel,checkOverlaps(doc)||(result.nearFooter?'O texto chegou perto do rodapé. Confira a prévia.':result.lines>result.before+1?`Este campo passou de ${result.before} para ${result.lines} linhas.`:layoutWarning(doc.root)));
     doc.dirty=true;paint(preview,doc);onChange();
    }catch(error){notice(panel,error.message);}
   };
  });
 }

 function pictureRow(item,kind){
  const label=kind==='empty'?item.label:'Imagem inserida';
  return `<div class="svg-picture" data-kind="${kind}"><span>${esc(label)}</span><label class="text-button upload">${kind==='empty'?'Escolher imagem':'Trocar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
   <button type="button" class="text-button" data-remove>${kind==='empty'?'Remover área':'Remover imagem'}</button></div>`;
 }

 function cropControls(){
  return `<div class="svg-crop">${[['zoom','Zoom',1,3,.05,crop.zoom],['x','Horizontal',-1,1,.02,crop.x],['y','Vertical',-1,1,.02,crop.y]].map(([name,text,min,max,step,value])=>`<label>${text}<input type="range" data-crop="${name}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`).join('')}</div>`;
 }

 function renderPictures(panel,preview,doc){
  const empties=placeholdersOf(doc.root),placed=picturesOf(doc.root),host=panel.querySelector('.svg-pictures');
  host.innerHTML=[...empties.map(item=>pictureRow(item,'empty')),...placed.map(item=>pictureRow(item,'placed'))].join('')+(crop?cropControls():'');
  const rows=[...host.querySelectorAll('.svg-picture')],items=[...empties,...placed];
  rows.forEach((row,index)=>{
   const item=items[index],empty=row.dataset.kind==='empty';
   row.querySelector('input').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
     const bitmap=await readPicture(file),id=uid();
     crop={bitmap,box:item.box,id,zoom:1,x:0,y:0};
     placePicture(doc.root,item.node,item.box,cropToDataUri(bitmap,item.box,crop),id);
     doc.dirty=true;notice(panel,checkOverlaps(doc));paint(preview,doc);renderPictures(panel,preview,doc);onChange();
    }catch(error){notice(panel,error.message);}
   };
   row.querySelector('[data-remove]').onclick=()=>{
    if(empty)item.node.remove();else restorePlaceholder(doc.root,item.node,item.box);
    crop=null;doc.dirty=true;notice(panel,checkOverlaps(doc));paint(preview,doc);renderPictures(panel,preview,doc);onChange();
   };
  });
  host.querySelectorAll('[data-crop]').forEach(input=>{
   input.oninput=()=>{
    crop[input.dataset.crop]=Number(input.value);
    const image=doc.root.querySelector(`image[id="IMAGEM-${crop.id}"]`);
    if(!image)return;
    image.setAttribute('href',cropToDataUri(crop.bitmap,crop.box,crop));doc.dirty=true;paint(preview,doc);onChange();
   };
  });
 }

 function buildPanel(panel,post,index,doc,preview){
  const fields=fieldsOf(doc.root),prompts=post.origin?.planning?.imagePrompts;
  panel.hidden=false;panel.dataset.key=panelKey(post,index);
  panel.innerHTML=`<div class="svg-head"><strong>Arte em SVG · slide ${index+1}</strong><span class="svg-warning">${esc(layoutWarning(doc.root))}</span></div>
   <div class="svg-fields">${fields.map(fieldHtml).join('')}</div><div class="svg-pictures"></div>
   <div class="actions svg-actions"><select data-template>${templateOptions()}</select><button type="button" class="text-button" data-apply-template>Usar neste slide</button>${importButton}<button type="button" class="text-button" data-download>Baixar SVG</button></div>
   ${prompts?`<details><summary>Prompts das imagens</summary><pre class="svg-prompts">${esc(prompts)}</pre></details>`:''}`;
  bindFields(panel,preview,doc,fields);bindTemplate(panel,post,index);bindImport(panel,post,index);renderPictures(panel,preview,doc);
  panel.querySelector('[data-download]').onclick=()=>download(post,index);
 }

 function idle(panel,post,index){
  panel.hidden=!enabled;panel.dataset.key=panelKey(post,index,'idle:');
  panel.innerHTML=`<div class="svg-head"><strong>Arte em SVG</strong><span class="svg-warning"></span></div><p class="help">Comece este slide por um template da marca e edite o texto por campo.</p>
   <div class="actions svg-actions"><select data-template>${templateOptions()}</select><button type="button" class="text-button" data-apply-template>Usar neste slide</button>${importButton}</div>`;
  bindTemplate(panel,post,index);bindImport(panel,post,index);
 }

 // Draws the slide's SVG in the preview and builds the field panel once per slide (typing never rebuilds it).
 async function mount({preview,panel,post,index}){
  if(!has(post,index)){token++;if(enabled&&panel.dataset.key!==panelKey(post,index,'idle:'))idle(panel,post,index);return false;}
  const mine=++token;
  try{
   const doc=await docFor(post,index);
   if(mine!==token)return true;
   paint(preview,doc);
   if(panel.dataset.key!==panelKey(post,index))buildPanel(panel,post,index,doc,preview);
  }catch(error){if(mine===token)preview.innerHTML=`<p class="brand-warning">${esc(error.message)}</p>`;}
  return true;
 }

 // Uploads edited SVGs as new files and keeps headline and alt text of the saved slide in step with the art.
 async function persist(post){
  const pending=[];
  slidesOf(post).forEach((entry,index)=>{const doc=docs.get(keyOf(post,index));if(entry&&doc&&(doc.dirty||!entry.path))pending.push({index,doc});});
  if(!pending.length)return false;
  const paths=await repository.uploadSvgs(post,pending.map(({index,doc})=>({index,text:serializeSvg(doc.root)})));
  pending.forEach(({index,doc},position)=>{
   post.origin.svg.slides[index]={path:paths[position]};doc.path=paths[position];doc.dirty=false;
   const slide=post.content.slides[index],title=mainTitle(doc.root);
   if(slide&&title){slide.headline=title.slice(0,120);if(!slide.alt?.trim())slide.alt=`Slide ${index+1}: ${title}`.slice(0,500);}
  });
  return true;
 }

 async function toJpeg(post,index,{requiredText=[],total=1}={}){
  const doc=await docFor(post,index);
  try{
   const edge=index===0||index===total-1,issue=edge?signatureIssue(doc.root.textContent,requiredText):'';
   if(issue)throw Error(issue);
   const overlap=checkOverlaps(doc);
   if(overlap)throw Error(overlap);
   return await svgToJpeg(doc.root);
  }catch(error){throw Error(`Slide ${index+1}: ${error.message}`);}
 }

 function removeAt(post,index){
  const slides=slidesOf(post);if(!slides.length)return;
  const moved=[...docs.entries()].filter(([key])=>key.startsWith(post.id+':'));
  moved.forEach(([key])=>docs.delete(key));
  slides.splice(index,1);
  for(const [key,doc] of moved){const at=Number(key.split(':')[1]);if(at!==index)docs.set(keyOf(post,at>index?at-1:at),doc);}
  version++;
 }

 async function download(post,index){
  const doc=await docFor(post,index),link=document.createElement('a'),url=URL.createObjectURL(new Blob([serializeSvg(doc.root)],{type:'image/svg+xml'}));
  link.href=url;link.download=`${post.id}-slide-${String(index+1).padStart(2,'0')}.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }

 return {enabled,has,mount,persist,toJpeg,removeAt,download};
}
