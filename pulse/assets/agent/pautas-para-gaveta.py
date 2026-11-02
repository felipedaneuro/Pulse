#!/usr/bin/env python3
"""Gera a "gaveta de temas": uma planilha de pautas vira rascunhos sem data na etapa Ideia.

Uso:  python3 pautas-para-gaveta.py PLANILHA.xlsx ID_DA_CONTA_EDITORIAL [PASTA_DE_SAIDA]

Só usa a biblioteca padrão. Escreve lote1.sql, lote2.sql… (até ~24 KB cada) para colar no SQL Editor do Supabase.
Cada comando chama public.pulse_agent_save, que valida e versiona como qualquer rascunho. Nada é agendado nem aprovado.
O id de cada post é determinístico (uuid5 do ID da pauta): rodar de novo não duplica, falha com "Este post já existe".

Planilha: uma aba chamada "Banco de pautas" com os cabeçalhos abaixo (a ordem não importa) e, opcionalmente, uma aba
"Fontes" (Autor / origem, Título, DOI, Pautas que dependem dela). Veja docs/MANUAL_IMPLEMENTACAO.md.
  ID · Tema · Linha · Público-alvo · Formato · Pauta (título de trabalho) · Gancho… · Estrutura do conteúdo · CTA…
  · Métrica que conta · Âncora de evidência · Confiança · Ressalva de confiança · Assinatura… · Risco… · Status
"""
import json,re,sys,uuid,zipfile,xml.etree.ElementTree as ET
from pathlib import Path

NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
LIMIT_SQL=24000

def column_number(reference):
    number=0
    for char in re.match(r'[A-Z]+',reference).group():number=number*26+ord(char)-64
    return number

def read_sheet(archive,shared,index):
    rows=[]
    root=ET.fromstring(archive.read(f'xl/worksheets/sheet{index}.xml'))
    for row in root.find('m:sheetData',NS).findall('m:row',NS):
        cells={}
        for cell in row.findall('m:c',NS):
            value=cell.find('m:v',NS)
            if value is None:continue
            cells[column_number(cell.get('r'))]=shared[int(value.text)] if cell.get('t')=='s' else value.text
        rows.append(cells)
    return rows

def read_workbook(path):
    archive=zipfile.ZipFile(path)
    shared=[''.join(t.text or '' for t in si.iter('{%s}t'%NS['m'])) for si in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si',NS)]
    names=[sheet.get('name') for sheet in ET.fromstring(archive.read('xl/workbook.xml')).find('m:sheets',NS)]
    sheets={}
    for position,name in enumerate(names,1):
        rows=read_sheet(archive,shared,position)
        if not rows:continue
        header=rows[0]
        sheets[name]=[{header[i]:row.get(i,'') for i in header} for row in rows[1:] if row.get(min(header))]
    return sheets

def shorten(text,limit=120):
    text=text.strip()
    if len(text)<=limit:return text,False
    return text[:limit-1].rsplit(' ',1)[0].rstrip(' ,;:—-')+'…',True

def slide(text):
    headline,cut=shorten(text)
    return {'headline':headline,'body':text if cut else '','alt':''}

def pick(row,prefix):
    return next((value.strip() for key,value in row.items() if key.lower().startswith(prefix.lower())),'')

def sources_for(pauta_id,sources):
    found=[]
    for row in sources:
        ids=[item.strip() for item in re.split(r'[,;]',pick(row,'Pautas'))]
        doi=pick(row,'DOI')
        if pauta_id in ids and re.fullmatch(r'10\.\d{4,9}/\S+',doi):
            found.append({'url':'https://doi.org/'+doi,'label':shorten(f"{pick(row,'Autor')} — {pick(row,'Título')}",90)[0]})
    return found

def build_post(row,sources):
    pauta_id,fmt,hook=pick(row,'ID'),pick(row,'Formato'),pick(row,'Gancho')
    parts=[part.strip() for part in pick(row,'Estrutura').split(' · ') if part.strip()]
    texts=[hook if re.match(r'^S1\b',part) else re.sub(r'^S\d+\s+','',part) for part in parts] if fmt.startswith('Carrossel') else [hook]+parts
    texts=[text for text in texts if text]
    while len(texts)<2:texts.append('Desenvolver o conteúdo')
    if len(texts)>10:texts=texts[:9]+[' · '.join(texts[9:])]
    status=pick(row,'Status')
    planning={'stage':'idea','campaign':'Gaveta · '+pick(row,'Tema')[:40],'pautaId':pauta_id,'format':fmt,'line':pick(row,'Linha'),'audience':pick(row,'Público'),
     'metric':pick(row,'Métrica'),'evidence':pick(row,'Âncora'),'confidence':pick(row,'Confiança'),'signature':pick(row,'Assinatura'),'risk':pick(row,'Risco'),'bankStatus':status}
    caveat=pick(row,'Ressalva')
    if caveat not in ('','—'):planning['caveat']=caveat
    planning={key:value for key,value in planning.items() if value}
    content={'title':pick(row,'Pauta')[:160],'caption':pick(row,'CTA'),'sources':sources_for(pauta_id,sources),'slides':[slide(text) for text in texts]}
    label=f"Banco de pautas · {pauta_id} · {pick(row,'Confiança')}"+('' if status in ('','Nova') else f' · {status}')
    origin={'kind':'banco-pautas','label':label,'planning':planning}
    return str(uuid.uuid5(uuid.NAMESPACE_URL,'pulse-gaveta/'+pauta_id)),content,origin

def literal(value):
    text=json.dumps(value,ensure_ascii=False,separators=(',',':'))
    if '$p$' in text:raise ValueError('O conteúdo contém "$p$", que quebraria o SQL.')
    return f'$p${text}$p$::jsonb'

def main():
    if len(sys.argv)<3:sys.exit(__doc__)
    workbook,account=sys.argv[1],sys.argv[2]
    out=Path(sys.argv[3] if len(sys.argv)>3 else '.')
    if not re.fullmatch(r'[0-9a-f-]{36}',account):sys.exit('ID da conta editorial inválido (use o uuid de pulse_editorial_accounts).')
    sheets=read_workbook(workbook)
    if 'Banco de pautas' not in sheets:sys.exit('A planilha precisa ter a aba "Banco de pautas".')
    statements=[]
    for row in sheets['Banco de pautas']:
        post_id,content,origin=build_post(row,sheets.get('Fontes',[]))
        statements.append(f"select public.pulse_agent_save('{account}','{post_id}',0,{literal(content)},{literal(origin)})->>'id'")
    batches,current,size=[],[],0
    for statement in statements:
        if current and size+len(statement)>LIMIT_SQL:batches.append(current);current,size=[],0
        current.append(statement);size+=len(statement)
    batches.append(current)
    out.mkdir(parents=True,exist_ok=True)
    for number,batch in enumerate(batches,1):(out/f'lote{number}.sql').write_text(' union all\n'.join(batch)+';',encoding='utf-8')
    print(f'{len(statements)} pautas em {len(batches)} lote(s) em {out}/')

if __name__=='__main__':main()
