const test = require('node:test');
const assert = require('node:assert/strict');
const radar = require('../radar-core.js');
const metadata = {version:'2.0.1',generated:1793278500,host:'https://tilecache.rainviewer.com',radar:{past:[
  {time:1793278200,path:'/v2/radar/aef991c'},
  {time:1793277600,path:'/v2/radar/c80b2fa'},
  {time:1793278200,path:'/v2/radar/aef991c'},
  {time:1793278300,path:'javascript:alert(1)'}
]}};
test('aceita a fonte de tiles oficial e ordena quadros sem duplicatas',()=>{
  const result=radar.parseMetadata(metadata);
  assert.equal(result.host,'https://tilecache.rainviewer.com');
  assert.deepEqual(result.frames.map(f=>f.time),[1793277600,1793278200]);
});
test('bloqueia host malicioso e protocolo inseguro',()=>{
  assert.throws(()=>radar.parseMetadata({...metadata,host:'http://tilecache.rainviewer.com'}),/autorizado/);
  assert.throws(()=>radar.parseMetadata({...metadata,host:'https://tilecache.rainviewer.com.evil.test'}),/autorizado/);
  assert.throws(()=>radar.parseMetadata({...metadata,host:'https://tilecache.rainviewer.com/?foo=x'}),/autorizado/);
});
test('não constrói tile para quadro fora dos metadados',()=>{
  const info=radar.parseMetadata(metadata);
  assert.throws(()=>radar.tileTemplate(info,{path:'/v2/radar/invalid'}),/não reconhecido/);
});
test('usa cores permitidas pela RainViewer em 2026',()=>{
  const info=radar.parseMetadata(metadata);
  assert.equal(radar.tileTemplate(info,info.frames[0]),'https://tilecache.rainviewer.com/v2/radar/c80b2fa/256/{z}/{x}/{y}/2/1_1.png');
});
test('informa idade sem valores negativos',()=>{
  assert.equal(radar.ageMinutes(100,100000+30*60000),30);
  assert.equal(radar.ageMinutes(100,90000),0);
});
test('quadros de radar atrasados não são apresentados como recentes',()=>{const now=(1793278200+91*60)*1000;assert.equal(radar.isLatestFrameRecent(radar.parseMetadata(metadata),now),false);assert.equal(radar.isLatestFrameRecent(radar.parseMetadata(metadata),(1793278200+20*60)*1000),true);});
test('sem quadros não representa radar como ativo',()=>{
  assert.throws(()=>radar.parseMetadata({...metadata,radar:{past:[]}}),/não retornou quadros/);
});
