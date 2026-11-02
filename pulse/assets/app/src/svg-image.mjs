// Imagens nas áreas reservadas dos SVGs: recorte no formato da área e troca do rótulo tracejado pela foto.
import {SVG_NS} from './svg-edit-core.mjs';

const MAX_FILE=20*1024*1024,MAX_SIDE=1600;
const IMAGE_TYPES=['image/jpeg','image/png','image/webp'];

export function cropPlan(source,box,{zoom=1,x=0,y=0}={},scale=2){
 const ratio=Math.min(scale,MAX_SIDE/Math.max(box.w,box.h)),width=Math.round(box.w*ratio),height=Math.round(box.h*ratio);
 const base=Math.max(width/source.width,height/source.height)*Math.max(1,zoom),drawW=source.width*base,drawH=source.height*base;
 return {width,height,drawW,drawH,dx:(width-drawW)/2+x*(drawW-width)/2,dy:(height-drawH)/2+y*(drawH-height)/2};
}

export async function readPicture(file){
 if(!IMAGE_TYPES.includes(file.type)||file.size>MAX_FILE)throw Error('Use uma imagem JPEG, PNG ou WebP de até 20 MB.');
 return createImageBitmap(file);
}

export function cropToDataUri(bitmap,box,adjust){
 const plan=cropPlan(bitmap,box,adjust),canvas=document.createElement('canvas');
 canvas.width=plan.width;canvas.height=plan.height;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,plan.width,plan.height);
 ctx.drawImage(bitmap,plan.dx,plan.dy,plan.drawW,plan.drawH);
 return canvas.toDataURL('image/jpeg',.9);
}

const attributes=(element,values)=>{for(const [name,value] of Object.entries(values))element.setAttribute(name,String(value));return element;};
const boxOf=value=>{const [x,y,w,h,rx]=String(value).split(',').map(Number);return {x,y,w,h,rx:rx||0};};

export const picturesOf=root=>[...root.querySelectorAll('image')].filter(node=>/^IMAGEM-/.test(node.getAttribute('id')||'')).map(node=>({node,box:boxOf(node.getAttribute('data-box'))}));

// Replaces the dashed placeholder (or a previous picture) with the cropped picture, clipped to the area's rounded corners.
export function placePicture(root,target,box,dataUri,uid){
 const doc=root.ownerDocument,clipId=`clip-${uid}`;
 let defs=[...root.children].find(child=>child.tagName==='defs');
 if(!defs){defs=doc.createElementNS(SVG_NS,'defs');root.insertBefore(defs,root.firstChild);}
 for(const old of [...defs.querySelectorAll('clipPath')].filter(node=>node.getAttribute('id')===clipId))old.remove();
 const clip=doc.createElementNS(SVG_NS,'clipPath');clip.setAttribute('id',clipId);
 clip.append(attributes(doc.createElementNS(SVG_NS,'rect'),{x:box.x,y:box.y,width:box.w,height:box.h,rx:box.rx||0}));
 defs.append(clip);
 const image=attributes(doc.createElementNS(SVG_NS,'image'),{id:`IMAGEM-${uid}`,'data-box':[box.x,box.y,box.w,box.h,box.rx||0].join(','),x:box.x,y:box.y,width:box.w,height:box.h,
  preserveAspectRatio:'none','clip-path':`url(#${clipId})`,href:dataUri});
 target.replaceWith(image);
}

export function restorePlaceholder(root,image,box,label='Imagem'){
 const doc=root.ownerDocument,group=attributes(doc.createElementNS(SVG_NS,'g'),{id:'PLACEHOLDER-IMAGEM','data-name':'PLACEHOLDER-IMAGEM'});
 group.append(attributes(doc.createElementNS(SVG_NS,'rect'),{x:box.x,y:box.y,width:box.w,height:box.h,rx:box.rx||0,fill:'none',stroke:'#BF8E63','stroke-width':3,'stroke-dasharray':'18 14'}));
 const text=attributes(doc.createElementNS(SVG_NS,'text'),{id:'PLACEHOLDER-IMAGEM-rotulo','font-family':'Inter','font-weight':500,'font-size':26,fill:'#BF8E63','text-anchor':'middle',x:box.x+box.w/2,y:box.y+box.h/2});
 text.textContent=label;group.append(text);
 image.replaceWith(group);
}
