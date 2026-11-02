import test from 'node:test';
import assert from 'node:assert/strict';
import {slideRole,themeFor,wrapLines} from './brand-theme.mjs';

const measure=text=>text.length*10;

test('o tema vem da chave da conta e some quando não existe', () => {
 const themes={'conta-exemplo':{handle:'@seu.perfil'}};
 assert.equal(themeFor({account_key:'conta-exemplo'},themes).handle,'@seu.perfil');
 assert.equal(themeFor({account_key:'outra'},themes),null);
 assert.equal(themeFor(undefined,themes),null);
 assert.equal(themeFor({account_key:'conta-exemplo'},undefined),null);
});

test('capa, miolo e fechamento seguem a posição do slide', () => {
 assert.equal(slideRole(0,7),'cover');
 assert.equal(slideRole(3,7),'inner');
 assert.equal(slideRole(6,7),'closing');
 assert.equal(slideRole(0,1),'cover');
});

test('quebra por largura e preserva parágrafos', () => {
 assert.deepEqual(wrapLines(measure,'um dois tres quatro',90),['um dois','tres','quatro']);
 assert.deepEqual(wrapLines(measure,'a b\n\nc d',200),['a b','','c d']);
 assert.deepEqual(wrapLines(measure,'',200),[]);
});

test('palavra maior que a largura interrompe com a mensagem pedida', () => {
 assert.throws(()=>wrapLines(measure,'curto palavralongademais',100,'longa demais'),/longa demais/);
});
