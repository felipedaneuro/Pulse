// Camada do navegador do editor de SVG: leitura sanitizada, medição, reajuste de linhas e exportação em JPEG.
import {SVG_NS,ALLOWED_TAGS,safeAttribute,textInfo,reflowLines,isUpper,placeholdersOf,fieldsOf,textBox,rectBox,boxesOverlap,pairKey} from './svg-edit-core.mjs';

const XML_NS='http://www.w3.org/XML/1998/namespace',MAX_BYTES=6_000_000,MAX_NODES=20000,MAX_DEPTH=40;
const FONT_FILES={Inter:[400,500,600,700,800],Poppins:[300,400,500,600,700]};
const fontCache=new Map();

function copyAttributes(source,target){
 for(const attribute of source.attributes){
  if(!safeAttribute(attribute.name,attribute.value))continue;
  if(attribute.name==='xml:space')target.setAttributeNS(XML_NS,'xml:space',attribute.value);
  else target.setAttribute(attribute.name,attribute.value);
 }
}

// Never keeps the parsed tree: builds a new one with only allowed elements and attributes.
function copyTree(source,doc,counter,depth=0){
 if(depth>MAX_DEPTH||++counter.nodes>MAX_NODES)throw Error('Este SVG é complexo demais para o editor.');
 const element=doc.createElementNS(SVG_NS,source.localName);
 copyAttributes(source,element);
 for(const child of source.childNodes){
  if(child.nodeType===3&&['text','tspan','title'].includes(source.localName))element.append(doc.createTextNode(child.nodeValue));
  else if(child.nodeType===1&&child.namespaceURI===SVG_NS&&ALLOWED_TAGS.has(child.localName))element.append(copyTree(child,doc,counter,depth+1));
 }
 return element;
}

export function parseSvg(text){
 if(typeof text!=='string'||text.length>MAX_BYTES)throw Error('Arquivo SVG grande demais.');
 const parsed=new DOMParser().parseFromString(text,'image/svg+xml');
 const source=parsed.documentElement;
 if(!source||source.localName==='parsererror'||parsed.querySelector('parsererror'))throw Error('O arquivo não é um SVG válido.');
 if(source.localName!=='svg'||source.namespaceURI!==SVG_NS)throw Error('O arquivo não é um SVG.');
 const [,,width,height]=String(source.getAttribute('viewBox')||'').split(/\s+/).map(Number);
 if(!(width>=100&&width<=4000&&height>=100&&height<=4000))throw Error('O SVG precisa de um viewBox entre 100 e 4000 px.');
 const doc=document.implementation.createDocument(SVG_NS,'svg');
 const root=copyTree(source,doc,{nodes:0});
 doc.replaceChild(root,doc.documentElement);
 root.setAttribute('xmlns',SVG_NS);
 return root;
}

export const serializeSvg=root=>new XMLSerializer().serializeToString(root);

function letterSpacingPx(node,size){
 const raw=node.getAttribute('letter-spacing')||'';
 return raw.endsWith('em')?parseFloat(raw)*size:parseFloat(raw)||0;
}

const fontOf=node=>({weight:node.getAttribute('font-weight')||'400',size:parseFloat(node.getAttribute('font-size'))||16,family:node.getAttribute('font-family')||'Inter'});

export function measurer(node){
 const {weight,size,family}=fontOf(node),ctx=document.createElement('canvas').getContext('2d');
 ctx.font=`${weight} ${size}px ${family}, sans-serif`;ctx.letterSpacing=`${letterSpacingPx(node,size)}px`;
 return text=>ctx.measureText(text).width;
}

export async function loadFieldFonts(root){
 const fonts=new Set([...root.querySelectorAll('text')].map(node=>{const {weight,size,family}=fontOf(node);return `${weight} ${size}px ${family}`;}));
 await Promise.all([...fonts].map(font=>document.fonts.load(font).catch(()=>[])));
}

export const viewBoxOf=root=>String(root.getAttribute('viewBox')).split(/\s+/).map(Number);

function boxOfText(node,viewWidth){
 const info=textInfo(node,viewWidth),spans=[...node.children].filter(child=>child.tagName==='tspan'),measure=measurer(node);
 const ys=spans.map(span=>Number(span.getAttribute('y'))),width=Math.max(0,...(spans.length?spans:[node]).map(span=>measure(span.textContent.trim())));
 return textBox({anchor:info.anchor,x:info.x,firstY:ys.length?ys[0]:info.y,lastY:ys.length?ys[ys.length-1]:info.y,fontSize:info.fontSize,width});
}

function layoutBoxes(root){
 const [,,viewWidth]=viewBoxOf(root);
 return [...fieldsOf(root).map(field=>({id:field.id,node:field.node,box:boxOfText(field.node,viewWidth)})),
  ...placeholdersOf(root).map((item,index)=>({id:`imagem-${index+1}`,box:rectBox(item.box)}))];
}

// Pairs of elements whose boxes touch. The pairs present when the art was opened are the design's own; only new ones are a problem.
export function collisionPairs(root){
 const items=layoutBoxes(root),pairs=new Set();
 items.forEach((a,i)=>items.slice(i+1).forEach(b=>{if(boxesOverlap(a.box,b.box))pairs.add(pairKey(a.id,b.id));}));
 return pairs;
}

const SIDE_GAP=24;
// A left-aligned field must stop before an element on its right that shares its band (for example the slide number).
function widthBesideOthers(node,info){
 if(info.anchor!=='start')return info.maxWidth;
 const root=node.ownerDocument.documentElement,mine=boxOfText(node,info.viewWidth);
 const rights=layoutBoxes(root).filter(item=>item.node!==node&&item.box.left>info.x&&item.box.top<mine.bottom&&mine.top<item.box.bottom).map(item=>item.box.left);
 return rights.length?Math.max(120,Math.min(info.maxWidth,Math.round(Math.min(...rights)-info.x-SIDE_GAP))):info.maxWidth;
}

// Re-flows an edited field inside its original box. Returns what the owner needs to know about the result.
export function applyText(node,value,viewBox){
 const [,,viewWidth,viewHeight]=viewBox,info=textInfo(node,viewWidth),text=isUpper(info.text)?value.toUpperCase():value;
 const lines=reflowLines({text,x:info.x,y:info.y,lineHeight:info.lineHeight,maxWidth:widthBesideOthers(node,info),measure:measurer(node),message:'Há uma palavra ou URL longa demais para este campo.'});
 const doc=node.ownerDocument,spans=(lines.length?lines:[{x:info.x,y:info.y,text:''}]).map(line=>{
  const span=doc.createElementNS(SVG_NS,'tspan');span.setAttribute('x',String(line.x));span.setAttribute('y',String(line.y));span.textContent=line.text;return span;
 });
 node.replaceChildren(...spans);
 const last=spans.length?Number(spans[spans.length-1].getAttribute('y')):info.y;
 return {lines:spans.length,before:info.lines,nearFooter:last>viewHeight-170};
}

async function fontDataUri(family,weight){
 const key=`${family}-${weight}`;
 if(!fontCache.has(key))fontCache.set(key,fetch(`brand/fonts/${family.toLowerCase()}-${weight}.ttf`).then(async response=>{
  if(!response.ok)return null;
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return `data:font/ttf;base64,${btoa(binary)}`;
 }).catch(()=>null));
 return fontCache.get(key);
}

async function embeddedFontCss(root){
 const used=new Set([...root.querySelectorAll('text')].map(node=>{const {family,weight}=fontOf(node);return `${family.split(',')[0].trim()}|${weight}`;}));
 const rules=[];
 for(const item of used){
  const [family,weight]=item.split('|');
  if(!FONT_FILES[family]?.includes(Number(weight)))continue;
  const uri=await fontDataUri(family,weight);
  if(uri)rules.push(`@font-face{font-family:"${family}";font-weight:${weight};src:url(${uri}) format("truetype");}`);
 }
 return rules.join('');
}

// The finished art cannot carry guides or an empty image area into Instagram.
export function prepareForExport(root){
 const copy=root.cloneNode(true);
 for(const guide of [...copy.querySelectorAll('g')].filter(node=>node.getAttribute('id')==='guias-NAO-EXPORTAR'))guide.remove();
 const empty=placeholdersOf(copy);
 if(empty.length)throw Error(`Ainda há área de imagem vazia ("${empty[0].label}"). Insira a imagem ou remova a área.`);
 return copy;
}

const loadImage=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Não foi possível desenhar o SVG.'));image.src=url;});

export async function svgToJpeg(root,quality=.94){
 const copy=prepareForExport(root),[,,width,height]=viewBoxOf(copy);
 const style=copy.ownerDocument.createElementNS(SVG_NS,'style');
 style.textContent=await embeddedFontCss(copy);
 copy.insertBefore(style,copy.firstChild);
 copy.setAttribute('width',String(width));copy.setAttribute('height',String(height));
 const image=await loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(serializeSvg(copy)));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
 // The embedded fonts may finish decoding after the first frame; drawing twice avoids a fallback font in the export.
 ctx.drawImage(image,0,0,width,height);await new Promise(resolve=>setTimeout(resolve,80));ctx.drawImage(image,0,0,width,height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
 if(!blob)throw Error('Falha ao gerar o JPEG.');
 return blob;
}
