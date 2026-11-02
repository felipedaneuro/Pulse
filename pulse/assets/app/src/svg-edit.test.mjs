import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAttribute,maxWidthFor,reflowLines,fieldsOf,placeholdersOf,signatureIssue,textInfo,isUpper,mainTitle,layoutWarning,textBox,rectBox,boxesOverlap,pairKey} from './svg-edit-core.mjs';
import {cropPlan} from './svg-image.mjs';
import {groupBankFiles,applyBankImport} from './svg-import.mjs';
import {svgPath} from './publication-schedule.mjs';

const element=(tagName,attributes={},children=[],text='')=>({tagName,children,textContent:children.length?children.map(child=>child.textContent).join(''):text,getAttribute:name=>attributes[name]??null});
const line=(x,y,text)=>element('tspan',{x:String(x),y:String(y)},[],text);
const textNode=(id,lines,extra={})=>element('text',{id,'font-size':'58','text-anchor':'start',...extra},lines.map(([x,y,text])=>line(x,y,text)));
const measure=text=>text.length*10;

test('só entram atributos conhecidos e valores sem script ou endereço externo',()=>{
 assert.ok(safeAttribute('fill','#3B4259'));
 assert.ok(safeAttribute('clip-path','url(#clip-ab12)'));
 assert.ok(safeAttribute('href','data:image/jpeg;base64,/9j/4AAQ=='));
 assert.ok(!safeAttribute('onclick','alert(1)'));
 assert.ok(!safeAttribute('href','https://exemplo.com/a.png'));
 assert.ok(!safeAttribute('fill','url(https://exemplo.com/x)'));
 assert.ok(!safeAttribute('d','javascript:alert(1)'));
 assert.ok(!safeAttribute('xmlns','http://outro'));
 assert.ok(!safeAttribute('id','a b'));
});

test('a largura útil respeita a margem de 88 px conforme o alinhamento',()=>{
 assert.equal(maxWidthFor('start',88,1080),904);
 assert.equal(maxWidthFor('end',992,1080),904);
 assert.equal(maxWidthFor('middle',540,1080),904);
 assert.equal(maxWidthFor('start',1040,1080),120);
});

test('o texto editado é refeito linha a linha a partir da posição original',()=>{
 const lines=reflowLines({text:'um dois tres quatro',x:88,y:178,lineHeight:68,maxWidth:90,measure});
 assert.deepEqual(lines,[{x:88,y:178,text:'um dois'},{x:88,y:246,text:'tres'},{x:88,y:314,text:'quatro'}]);
 assert.throws(()=>reflowLines({text:'palavralongademais',x:0,y:0,lineHeight:10,maxWidth:50,measure,message:'longa'}),/longa/);
});

test('o campo informa a posição, o espaçamento e a largura do texto original',()=>{
 const info=textInfo(textNode('titulo',[[88,178,'Nem todo aneurisma'],[88,246.4,'precisa de cirurgia']]));
 assert.equal(info.text,'Nem todo aneurisma precisa de cirurgia');
 assert.equal(info.lineHeight,68.4);assert.equal(info.x,88);assert.equal(info.maxWidth,904);assert.equal(info.lines,2);
 assert.ok(isUpper('NEUROCIRURGIA VASCULAR'));assert.ok(!isUpper('Neurocirurgia'));
});

test('campos: título editável; valor de gráfico e CRM/RQE travados; área de imagem fora da lista',()=>{
 const root=element('svg',{viewBox:'0 0 1080 1350'},[
  textNode('titulo',[[88,178,'Título']]),
  textNode('destaque',[[88,494,'65 em 100']]),
  textNode('rodape-crm',[[88,1262,'CRM-UF 000000 · RQE 00000/00000']]),
  element('g',{id:'PLACEHOLDER-IMAGEM'},[element('rect',{x:'88',y:'864.5',width:'784',height:'277.5',rx:'16'}),textNode('PLACEHOLDER-IMAGEM-rotulo',[[480,1012,'ILUSTRAÇÃO 1 · lupa']])]),
  element('g',{id:'guias-NAO-EXPORTAR'},[textNode('guia',[[0,0,'guia']])])
 ]);
 const fields=fieldsOf(root);
 assert.deepEqual(fields.map(field=>[field.id,field.locked]),[['titulo',false],['destaque',true],['rodape-crm',true]]);
 assert.equal(fields[0].label,'Título');assert.match(fields[1].lockReason,/gráfico/);
 const [placeholder]=placeholdersOf(root);
 assert.deepEqual(placeholder.box,{x:88,y:864.5,w:784,h:277.5,rx:16});assert.equal(placeholder.label,'ILUSTRAÇÃO 1 · lupa');
 assert.equal(mainTitle(root),'Título');
});

test('o formato 9:16 avisa que não entra em carrossel, e a assinatura obrigatória é conferida',()=>{
 assert.equal(layoutWarning(element('svg',{viewBox:'0 0 1080 1350'})),'');
 assert.match(layoutWarning(element('svg',{viewBox:'0 0 1080 1920'})),/1080×1920/);
 assert.equal(signatureIssue('Fulano · CRM-UF 000000 · RQE 00000/00000',['CRM-UF 000000','RQE 00000']),'');
 assert.match(signatureIssue('sem assinatura',['CRM-UF 000000','RQE 00000']),/CRM-UF 000000 · RQE 00000/);
});

test('o recorte cobre a área inteira e o enquadramento move dentro da sobra',()=>{
 const plan=cropPlan({width:2000,height:1000},{w:800,h:400});
 assert.deepEqual([plan.width,plan.height,plan.drawW,plan.drawH,plan.dx,plan.dy],[1600,800,1600,800,0,0]);
 const zoomed=cropPlan({width:2000,height:1000},{w:800,h:400},{zoom:2,x:-1,y:1});
 assert.equal(zoomed.drawW,3200);assert.equal(zoomed.dx,-1600);assert.equal(zoomed.dy,0);
 assert.ok(cropPlan({width:4000,height:4000},{w:3000,h:3000}).width<=1600);
});

const file=(path,name=path.split('/').pop())=>({name,webkitRelativePath:path});

test('a pasta do banco é agrupada por pauta, ignora pastas de tema e prefere a cópia mais completa',()=>{
 const groups=groupBankFiles([
  file('banco/ANE-01-risco/02-conteudo.svg'),file('banco/ANE-01-risco/01-capa.svg'),file('banco/ANE-01-risco/10-cta.svg'),file('banco/ANE-01-risco/legenda.txt'),
  file('banco/ANE-01-risco/PROMPTS-IMAGEM.md'),file('banco/ANE-01-risco/capa.png'),file('banco/ANEURISMA/leia-me.txt'),
  file('banco/copia/ANE-01-risco/01-capa.svg'),file('banco/L1-06-colega/01-capa.svg')
 ]);
 assert.deepEqual(groups.map(group=>group.id),['ANE-01','L1-06']);
 assert.deepEqual(groups[0].svgs.map(item=>item.name),['01-capa.svg','02-conteudo.svg','10-cta.svg']);
 assert.ok(groups[0].texts.caption&&groups[0].texts.prompts&&!groups[0].texts.comment);
});

const post={id:'p1',status:'review',planned_at:'2026-11-05T12:00:00Z',origin:{kind:'banco-pautas',planning:{stage:'idea',pautaId:'ANE-01',campaign:'Gaveta · Aneurisma'}},
 content:{title:'T',caption:'CTA antigo',sources:[],slides:[{headline:'a',body:'',alt:''},{headline:'b',body:'',alt:''},{headline:'c',body:'',alt:''}]}};

test('carrossel: os slides passam a ser os SVGs; legenda e prompts entram; volta a rascunho sem data',()=>{
 const next=applyBankImport(post,{paths:['w/svg/p1/b/slide-01.svg','w/svg/p1/b/slide-02.svg'],titles:['Capa','Meio'],caption:'Legenda real',prompts:'prompt 1',content:{status:'PRONTA p/ assinatura'},comment:'1º comentário',folder:'ANE-01-risco'});
 assert.deepEqual(next.content.slides.map(slide=>slide.headline),['Capa','Meio']);
 assert.equal(next.content.caption,'Legenda real');
 assert.deepEqual(next.origin.svg.slides,[{path:'w/svg/p1/b/slide-01.svg'},{path:'w/svg/p1/b/slide-02.svg'}]);
 assert.equal(next.origin.planning.imagePrompts,'prompt 1');assert.equal(next.origin.planning.pautaId,'ANE-01');assert.equal(next.origin.planning.produced,'PRONTA p/ assinatura');
 assert.equal(next.status,'draft');assert.equal(next.planned_at,null);assert.equal(post.content.caption,'CTA antigo');
});

test('arte única (capa de Reel) troca só o primeiro slide e mantém o roteiro; legenda grande demais é ignorada',()=>{
 const next=applyBankImport(post,{paths:['w/svg/p1/b/slide-01.svg'],titles:['Capa do Reel'],caption:'x'.repeat(2300)});
 assert.deepEqual(next.content.slides.map(slide=>slide.headline),['Capa do Reel','b','c']);
 assert.equal(next.content.caption,'CTA antigo');
});

test('o SVG editável fica no workspace, na pasta svg/, com o slide numerado',()=>{
 assert.equal(svgPath('ws','post','abc123',0),'ws/svg/post/abc123/slide-01.svg');
 assert.equal(svgPath('ws','post','abc123',9),'ws/svg/post/abc123/slide-10.svg');
});

test('texto que cresce para cima do vizinho é detectado; vizinhos que só se tocam na borda, não',()=>{
 const title=textBox({anchor:'start',x:88,firstY:313,lastY:313+2*60,fontSize:52,width:700});
 const number=textBox({anchor:'start',x:88,firstY:494,lastY:494,fontSize:124,width:600});
 assert.ok(boxesOverlap(title,number));
 const short=textBox({anchor:'start',x:88,firstY:313,lastY:313,fontSize:52,width:700});
 assert.ok(!boxesOverlap(short,number));
 assert.ok(!boxesOverlap({left:0,right:100,top:0,bottom:50},{left:100,right:200,top:0,bottom:50}));
 assert.ok(boxesOverlap(title,rectBox({x:88,y:330,w:784,h:277})));
 assert.equal(pairKey('titulo','destaque'),pairKey('destaque','titulo'));
});

test('a caixa do texto respeita o alinhamento',()=>{
 assert.equal(textBox({anchor:'end',x:992,firstY:140,lastY:140,fontSize:54,width:80}).left,912);
 assert.equal(textBox({anchor:'middle',x:540,firstY:0,lastY:0,fontSize:20,width:100}).left,490);
});
