// The Storage serves HTML from a signed link as plain text. The manual is downloaded with the owner's link and shown
// in a sandboxed frame: no scripts, no access to the Pulse session.
export async function openBrandManual(url,doc=document){
 const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error('Arquivo indisponível.');
 const html=new TextDecoder('utf-8').decode(await response.arrayBuffer());
 const dialog=doc.createElement('dialog');dialog.className='brand-manual';
 dialog.innerHTML='<form method="dialog"><button class="text-button" autofocus>Fechar</button></form><iframe title="Identidade visual" sandbox></iframe>';
 dialog.querySelector('iframe').srcdoc=html;
 dialog.addEventListener('close',()=>dialog.remove());
 doc.body.append(dialog);dialog.showModal();
}
