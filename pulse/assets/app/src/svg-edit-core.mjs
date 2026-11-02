// Núcleo do editor de SVG por campo: lista de permitidos, campos de texto, quebra de linha e conferências.
// Não acessa o navegador: recebe nós com a interface do DOM (getAttribute, children, textContent).
import {wrapLines} from './brand-theme.mjs';

export const SVG_NS='http://www.w3.org/2000/svg';
export const ALLOWED_TAGS=new Set(['svg','title','g','defs','rect','circle','line','path','text','tspan','image','pattern','clipPath']);
export const ALLOWED_ATTRIBUTES=new Set(['id','data-name','data-fundo','data-box','xmlns','viewBox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','d',
 'fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-dasharray','stroke-linecap','stroke-linejoin','stroke-opacity','opacity','transform','clip-path',
 'font-family','font-weight','font-size','font-style','text-anchor','letter-spacing','xml:space','preserveAspectRatio','href','patternUnits','patternTransform']);
const IMAGE_DATA_URI=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const LOCAL_URL=/^url\(#[A-Za-z0-9_-]+\)$/;
const MARGIN=88,MAX_ATTRIBUTE=3_000_000;
// Valor numérico dos textos ligados ao gráfico gerado: editar sem refazer o gráfico deixaria a peça incoerente.
const CHART_VALUE=/^(destaque|barra-\d+-valor)$/;
const SIGNATURE_FIELD=/^(rodape-crm|crm-rqe)$/;
const TITLE_IDS=['hook','titulo','chamada','titulo-artigo','subtitulo','kicker'];

export function safeAttribute(name,value){
 if(!ALLOWED_ATTRIBUTES.has(name)||typeof value!=='string'||value.length>MAX_ATTRIBUTE)return false;
 if(name==='href')return IMAGE_DATA_URI.test(value);
 if(name==='xmlns')return value===SVG_NS;
 if(name==='id')return /^[A-Za-z0-9_.:-]{1,120}$/.test(value);
 if(/javascript:|expression\(|[<>]/i.test(value))return false;
 return !/url\(/i.test(value)||LOCAL_URL.test(value.trim());
}

const LABELS={kicker:'Kicker','kicker-publico':'Público (kicker)','kicker-serie':'Série (kicker)',hook:'Gancho',apoio:'Apoio',titulo:'Título','titulo-artigo':'Título do artigo',
 subtitulo:'Subtítulo',corpo:'Corpo','texto-destaque':'Destaque','texto-destaque-nota':'Nota do destaque',destaque:'Número em destaque','destaque-sub':'Texto do destaque',
 'numero-slide':'Número do slide',chamada:'Chamada','badge-texto':'Botão','badge-comando-texto':'Comando do botão','grade-legenda':'Legenda do gráfico','eixo-rotulo':'Eixo',
 'rodape-arroba':'Rodapé · @',arroba:'Assinatura · @','rodape-crm':'Rodapé · CRM e RQE','crm-rqe':'CRM e RQE',revista:'Revista',referencia:'Referência',
 'rotulo-achado':'Rótulo do achado','texto-achado':'Achado','rotulo-implicacao':'Rótulo da implicação','texto-implicacao':'Implicação'};
export function labelFor(id){
 const item=/^item-(\d+)-(texto|numero)$/.exec(id),bar=/^barra-(\d+)-(rotulo|valor)$/.exec(id);
 if(item)return item[2]==='texto'?`Item ${item[1]}`:`Número do item ${item[1]}`;
 if(bar)return bar[2]==='rotulo'?`Rótulo da barra ${bar[1]}`:`Valor da barra ${bar[1]}`;
 return LABELS[id]||id.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase());
}

const num=(node,name,fallback=0)=>{const value=parseFloat(node.getAttribute(name));return Number.isFinite(value)?value:fallback;};
const tspansOf=node=>[...node.children].filter(child=>child.tagName==='tspan');
const clean=text=>String(text).replace(/\s+/g,' ').trim();

export function maxWidthFor(anchor,x,viewWidth){
 const room=anchor==='end'?x-MARGIN:anchor==='middle'?2*Math.min(x-MARGIN,viewWidth-MARGIN-x):viewWidth-MARGIN-x;
 return Math.max(120,Math.round(room));
}

export function reflowLines({text,x,y,lineHeight,maxWidth,measure,message}){
 return wrapLines(measure,text,maxWidth,message).map((line,index)=>({x,y:Math.round((y+index*lineHeight)*10)/10,text:line}));
}

export function textInfo(node,viewWidth=1080){
 const spans=tspansOf(node),first=spans[0]||node,ys=spans.map(span=>num(span,'y')),fontSize=num(node,'font-size',16);
 const anchor=node.getAttribute('text-anchor')||'start',x=num(first,'x',num(node,'x')),y=num(first,'y',num(node,'y'));
 return {anchor,x,y,fontSize,viewWidth,lineHeight:ys.length>1?Math.round((ys[1]-ys[0])*100)/100:Math.round(fontSize*1.2*100)/100,
  maxWidth:maxWidthFor(anchor,x,viewWidth),text:clean(spans.length?spans.map(span=>span.textContent).join(' '):node.textContent),
  customLayout:new Set(spans.map(span=>span.getAttribute('x'))).size>1,lines:Math.max(1,spans.length)};
}

export const isUpper=text=>text.length>1&&text===text.toUpperCase()&&text!==text.toLowerCase();

function walk(node,visit,hidden=false){
 const id=node.getAttribute?.('id')||'',skip=hidden||/^PLACEHOLDER/.test(id)||id==='guias-NAO-EXPORTAR';
 if(node.tagName==='text'&&!skip)visit(node);
 for(const child of node.children||[])walk(child,visit,skip);
}

export function fieldsOf(root){
 const viewWidth=(String(root.getAttribute('viewBox')||'').split(/\s+/).map(Number)[2])||1080,fields=[];
 walk(root,node=>{
  const info=textInfo(node,viewWidth),id=node.getAttribute('id')||`texto-${fields.length+1}`;
  const reason=CHART_VALUE.test(id)?'Valor ligado ao gráfico. Para mudar, regenere a peça pelo conteúdo.':SIGNATURE_FIELD.test(id)?'Assinatura obrigatória (CFM).':info.customLayout?'Layout especial: edite no gerador.':'';
  fields.push({id,label:labelFor(id),text:info.text,locked:Boolean(reason),lockReason:reason,node});
 });
 return fields;
}

export function placeholdersOf(root){
 const found=[];
 (function visit(node){
  if(node.tagName==='g'&&/^PLACEHOLDER-IMAGEM$/.test(node.getAttribute('id')||'')){
   const rect=[...node.children].find(child=>child.tagName==='rect');
   if(rect){
    const label=[...node.children].find(child=>child.tagName==='text'&&/rotulo/.test(child.getAttribute('id')||''));
    found.push({node,box:{x:num(rect,'x'),y:num(rect,'y'),w:num(rect,'width'),h:num(rect,'height'),rx:num(rect,'rx')},label:label?clean(label.textContent):'Imagem'});
   }
  }
  for(const child of node.children||[])visit(child);
 })(root);
 return found;
}

export function mainTitle(root){
 const byId=new Map(fieldsOf(root).map(field=>[field.id,field.text]));
 return TITLE_IDS.map(id=>byId.get(id)).find(Boolean)||'';
}

export const signatureIssue=(allText,required=[])=>{
 const text=String(allText).replace(/\s+/g,' '),missing=required.filter(part=>!text.includes(part));
 return missing.length?`Falta no rodapé: ${missing.join(' · ')}.`:'';
};

export function layoutWarning(root){
 const [,,width,height]=String(root.getAttribute('viewBox')||'').split(/\s+/).map(Number);
 return width===1080&&height===1350?'':`Formato ${width}×${height}: não entra em carrossel do feed (4:5).`;
}

// Caixa ocupada por um texto (aproximada: 0,85 de altura de fonte acima da linha de base e 0,25 abaixo).
export function textBox({anchor,x,firstY,lastY,fontSize,width}){
 const left=anchor==='end'?x-width:anchor==='middle'?x-width/2:x;
 return {left,right:left+width,top:firstY-fontSize*.85,bottom:lastY+fontSize*.25};
}
export const rectBox=({x,y,w,h})=>({left:x,right:x+w,top:y,bottom:y+h});
export const boxesOverlap=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;
export const pairKey=(a,b)=>[a,b].sort().join('|');
