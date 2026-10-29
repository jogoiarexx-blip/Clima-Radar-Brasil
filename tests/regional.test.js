'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const regional=require('../regional-core.js');
test('reconhece UFs, nomes e regioes sem chutar pela posicao',()=>{
  assert.equal(regional.ufFromMetadata('São Paulo'),'SP');
  assert.equal(regional.ufFromMetadata('MG'),'MG');
  assert.equal(regional.regionForUf('MG'),'Sudeste');
  assert.equal(regional.regionForUf('Pará'),'Norte');
  assert.equal(regional.regionForUf('Rio Grande do Sul'),'Sul');
  assert.equal(regional.regionForUf('Roraima'),'Norte');
  assert.equal(regional.ufFromMetadata('cidade vizinha'),null);
  assert.equal(regional.regionForUf('-20,-47'),null);
});
test('nao apresenta dados ausentes como zero e nao extrapola para relatorio nacional',()=>{
  const stations=[{id:'a',uf:'SP'},{id:'b',uf:'MG'},{id:'c',uf:null}];
  const temp={stations:[
    {id:'a',valid:true,baseMae:3,tunedMae:2,holdoutHours:48,modelMae:{ecmwf:2,gfs:1,icon:3}},
    {id:'b',valid:true,baseMae:5,tunedMae:4,holdoutHours:24,modelMae:{ecmwf:4,gfs:2,icon:6}},
    {id:'c',valid:true,baseMae:7,tunedMae:6,holdoutHours:30,modelMae:{ecmwf:5,gfs:4,icon:7}}],modelIds:['ecmwf','gfs','icon','gem']};
  const s=regional.summarize([{lead:1,result:{temp,rain:{stations:[],modelIds:[]}}}],stations);
  const sudeste=s.rows.find(r=>r.region==='Sudeste');
  assert.equal(sudeste.stationCount,2);
  assert.equal(sudeste.baseMae,4); // media por estacao, nao por 48 vs 24 horas
  assert.equal(sudeste.models.ecmwf,3);
  assert.equal(sudeste.models.gem,null);
  assert.equal(sudeste.limited,true);
  assert.equal(s.coverage.regions,1);
  assert.equal(s.coverage.withoutUf,1);
  assert.equal(s.coverage.national,false);
});
test('cruza todas as antecedencias e variaveis, mantem grupos sem UF separados',()=>{
  const stations=[{id:'sp',uf:'SP'},{id:'pa',uf:'PA'},{id:'se',uf:'SE'}];
  const make=(lead,kind)=>({modelIds:['gfs'],stations:stations.map(s=>({id:s.id,valid:true,baseMae:lead,tunedMae:lead-.1,modelMae:{gfs:lead},holdoutHours:48}))});
  const shots=[1,2,3].map(lead=>({lead,result:{temp:make(lead,'temp'),rain:make(lead,'rain')}}));
  const report=regional.summarize(shots,stations);
  assert.equal(report.rows.length,18); // 3 regioes x 3 leads x 2 variaveis
  assert.deepEqual(report.allLeads,[1,2,3]);
  assert.equal(report.coverage.regions,3);
  assert.equal(report.coverage.states,3);
  assert.ok(report.rows.some(r=>r.lead===3&&r.region==='Norte'&&r.kind==='rain'));
});
test('nao inclui estacoes sem validacao no agregado',()=>{
  const report=regional.summarize([{lead:1,result:{temp:{modelIds:['gfs'],stations:[
    {id:'a',valid:true,baseMae:2,tunedMae:1,modelMae:{gfs:2},holdoutHours:40},
    {id:'b',valid:false,baseMae:30,tunedMae:20,modelMae:{gfs:30},holdoutHours:1}
  ]}}}],[{id:'a',uf:'RJ'},{id:'b',uf:'RJ'}]);
  assert.equal(report.rows[0].stationCount,1);
  assert.equal(report.rows[0].baseMae,2);
});
