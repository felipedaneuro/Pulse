// Tema visual por conta: cores, fontes e assinatura vêm de config.brandThemes.
// Sem tema configurado, o Pulse mantém o visual padrão dos slides.
const WIDTH=1080,HEIGHT=1350,MARGIN=88,CONTENT=WIDTH-MARGIN*2,TITLE_WITH_NUMBER=780,BODY_LIMIT=1150;
const logoCache=new Map();

export const themeFor=(account,themes)=>themes?.[account?.account_key]||null;

export function slideRole(index,total){
 if(index===0)return 'cover';
 return index===total-1?'closing':'inner';
}

export function wrapLines(measure,text,maxWidth,longWordMessage='Há uma palavra ou URL longa demais.'){
 const lines=[];
 for(const paragraph of String(text||'').split('\n')){
  if(!paragraph.trim()){lines.push('');continue;}
  let line='';
  for(const word of paragraph.trim().split(/\s+/)){
   if(measure(word)>maxWidth)throw Error(longWordMessage);
   const candidate=line?line+' '+word:word;
   if(measure(candidate)>maxWidth&&line){lines.push(line);line=word;}else line=candidate;
  }
  lines.push(line);
 }
 while(lines.length&&lines[lines.length-1]==='')lines.pop();
 return lines;
}

function lineCount(ctx,text,font,width,message){
 ctx.font=font;
 return wrapLines(s=>ctx.measureText(s).width,text,width,message).length;
}

// Draws the text and returns the baseline where the next block starts.
function block(ctx,text,{font,color,x=MARGIN,y,width=CONTENT,lineHeight,alpha=1,message}){
 ctx.font=font;ctx.fillStyle=color;ctx.globalAlpha=alpha;
 for(const line of wrapLines(s=>ctx.measureText(s).width,text,width,message)){
  if(line)ctx.fillText(line,x,y);
  y+=line?lineHeight:lineHeight/2;
 }
 ctx.globalAlpha=1;
 return y;
}

function diagonal(ctx,color,offset,alpha){
 ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();
 ctx.moveTo(1864.3+offset,-60);ctx.lineTo(1890.3+offset,-60);ctx.lineTo(943+offset,1410);ctx.lineTo(917+offset,1410);ctx.closePath();ctx.fill();
 ctx.globalAlpha=1;
}

function footer(ctx,theme,logo,{handleColor,signatureColor,signatureAlpha}){
 const {fonts}=theme;
 ctx.font=`500 26px ${fonts.text}`;ctx.letterSpacing='0.52px';
 ctx.fillStyle=handleColor;ctx.fillText(theme.handle,MARGIN,1228);
 ctx.globalAlpha=signatureAlpha;ctx.fillStyle=signatureColor;ctx.fillText(theme.signature,MARGIN,1262);
 ctx.globalAlpha=1;ctx.letterSpacing='0px';
 if(logo)ctx.drawImage(logo,941,1194,51.4,75);
}

function overflow(index){return Error(`Reduza o texto do slide ${index+1}: ele excede o espaço.`);}

function drawDark(ctx,theme,slide,index,role,logo){
 const {colors,fonts}=theme,message=`Há uma palavra ou URL longa demais no slide ${index+1}.`;
 ctx.fillStyle=colors.dark;ctx.fillRect(0,0,WIDTH,HEIGHT);
 diagonal(ctx,colors.gold,0,.9);diagonal(ctx,colors.gold,190,.35);
 ctx.font=`500 32px ${fonts.display}`;ctx.letterSpacing='4.48px';ctx.fillStyle=colors.gold;ctx.fillText(theme.kicker,MARGIN,128);ctx.letterSpacing='0px';
 ctx.fillRect(MARGIN,176,96,6);
 const cover=role==='cover',font=`600 ${cover?82:64}px ${fonts.display}`,lineHeight=cover?92:74;
 const lines=lineCount(ctx,slide.headline,font,CONTENT,message);
 const top=cover?Math.max(300,834-(lines-1)*lineHeight):360;
 const next=block(ctx,slide.headline,{font,color:colors.white,y:top,lineHeight,message});
 const end=block(ctx,slide.body,{font:`400 34px ${fonts.text}`,color:colors.light,y:next+(cover?24:22),lineHeight:48,alpha:.85,message});
 if(end-48>BODY_LIMIT)throw overflow(index);
 footer(ctx,theme,logo,{handleColor:colors.white,signatureColor:colors.white,signatureAlpha:.8});
}

function drawLight(ctx,theme,slide,index,total,logo){
 const {colors,fonts}=theme,message=`Há uma palavra ou URL longa demais no slide ${index+1}.`;
 ctx.fillStyle=colors.light;ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.fillStyle=colors.gold;ctx.fillRect(MARGIN,102,72,6);
 ctx.font=`600 54px ${fonts.display}`;ctx.textAlign='right';ctx.globalAlpha=.45;ctx.fillStyle=colors.soft;
 ctx.fillText(String(index+1).padStart(2,'0'),WIDTH-MARGIN,140);ctx.globalAlpha=1;ctx.textAlign='left';
 const next=block(ctx,slide.headline,{font:`600 58px ${fonts.display}`,color:colors.ink,y:178,width:TITLE_WITH_NUMBER,lineHeight:68,message});
 const end=block(ctx,slide.body,{font:`400 38px ${fonts.text}`,color:colors.soft,y:next+28,lineHeight:55,message});
 if(end-55>BODY_LIMIT)throw overflow(index);
 footer(ctx,theme,logo,{handleColor:colors.soft,signatureColor:colors.soft,signatureAlpha:1});
}

export function drawSlide(ctx,theme,slide,index,total,logos={}){
 ctx.textBaseline='alphabetic';ctx.textAlign='left';
 const role=slideRole(index,total);
 if(role==='inner')drawLight(ctx,theme,slide,index,total,logos.light);
 else drawDark(ctx,theme,slide,index,role,logos.dark);
}

async function loadFonts({fonts}){
 await document.fonts.ready;
 await Promise.all([`500 32px ${fonts.display}`,`600 82px ${fonts.display}`,`400 34px ${fonts.text}`,`500 26px ${fonts.text}`].map(font=>document.fonts.load(font)));
}

// The logo is optional: a missing file leaves the slide without it instead of blocking the export.
function loadLogo(url){
 if(!url)return Promise.resolve(null);
 if(!logoCache.has(url))logoCache.set(url,new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=url;}));
 return logoCache.get(url);
}

export async function renderSlide(canvas,theme,slide,index,total){
 canvas.width=WIDTH;canvas.height=HEIGHT;
 await loadFonts(theme);
 const logos={dark:await loadLogo(theme.logos?.dark),light:await loadLogo(theme.logos?.light)};
 drawSlide(canvas.getContext('2d'),theme,slide,index,total,logos);
}
