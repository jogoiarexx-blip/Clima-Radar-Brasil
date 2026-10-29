'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../robustness-core.js');
function result(gains){
  return {stations:gains.map((gain,i)=>({id:'s'+i,name:'Estação '+i,valid:true,baseMae:2,tunedMae:2-gain}))};
}
test('amostra vazia nao apresenta falsa robustez',()=>{
  const r=core.analyze({stations:[]},'temp');
  assert.equal(r.consistent,false);assert.equal(r.n,0);
  assert.equal(r.range,null);assert.equal(r.limited,true);
});
test('tres estacoes positivas permanecem amostra pequena',()=>{
  const r=core.analyze(result([.2,.25,.3]),'temp');
  assert.equal(r.improved,3);assert.equal(r.worsened,0);
  assert.equal(r.consistent,false);assert.equal(r.limited,true);
});
test('cinco estacoes com melhora replicada podem ser consistentes NA AMOSTRA',()=>{
  const r=core.analyze(result([.2,.25,.3,.15,.35]),'temp');
  assert.equal(r.n,5);assert.equal(r.improved,5);
  assert.equal(r.consistent,true);assert.ok(r.range.low>0);
  assert.ok(r.minLeaveOneOut>0);
});
test('grande piora em uma estacao bloqueia robustez mesmo se quatro melhoraram',()=>{
  const r=core.analyze(result([.05,.08,.04,.07,-3]),'rain');
  assert.equal(r.worsened,1);assert.equal(r.consistent,false);
  assert.ok(r.minLeaveOneOut<0);
});
test('quatro estacoes melhoram e uma fica estavel; verifica criterio de 80 por cento',()=>{
  const r=core.analyze(result([.1,.2,.3,.4,0]),'temp');
  assert.equal(r.improved,4);assert.equal(r.stable,1);
  assert.equal(r.consistent,true);
});
test('aleatoriedade deterministica e sem mutacao dos dados originais',()=>{
  const input=result([.2,.4,.15,.3,-.02]);
  const frozen=JSON.stringify(input);
  const a=core.analyze(input,'temp'),b=core.analyze(input,'temp');
  assert.deepEqual(a,b);assert.equal(JSON.stringify(input),frozen);
});
test('dados invalidos e estacoes sem validade ficam excluidos de ganhos',()=>{
  const input=result([.5,-.3,.2,.1,.4]);
  input.stations[0].valid=false;
  input.stations[1].tunedMae=null;
  const r=core.analyze(input,'rain');
  assert.equal(r.n,3);assert.equal(r.improved,3);assert.equal(r.limited,true);
});
test('reamostragem com poucas estacoes nao produz conclusao',()=>{
  assert.equal(core.bootstrap([]),null);
  assert.equal(core.bootstrap([1,2]),null);
  const a=core.bootstrap([.1,.2,.3]);
  assert.equal(a.iterations,1000);
  assert.ok(a.low<=a.high);
});
test('sumario oferece temperatura e chuva independentes',()=>{
  const r=core.summarize({temp:result([.2,.3,.1,.4,.5]),rain:result([-.2,-.1,-.3,-.4,-.5])});
  assert.equal(r.temp.consistent,true);assert.equal(r.rain.consistent,false);
  assert.equal(r.rain.worsened,5);
});
