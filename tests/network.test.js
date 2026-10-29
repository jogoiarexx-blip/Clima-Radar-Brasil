'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('../network-core.js');
const MODELS=['ecmwf','gfs','icon','gem'];
function exampleStation(index,days=10){
  const coords={lat:-23+index*2.3,lon:-47+index*2.2};
  const observations=[];
  const data=Object.fromEntries(MODELS.map(id=>[id,{time:[],temperature_2m_previous_day1:[],precipitation_previous_day1:[]}])) ;
  const begin=Date.parse('2026-08-01T00:00:00Z');
  for(let k=0;k<days*24;k++){
    const iso=new Date(begin+k*3600000).toISOString().slice(0,16);
    const temperature=24+(k%24)/4+(index*0.7);
    const rain=k%6===0?3:0;
    observations.push({time:iso,temp:temperature,rain});
    for(const id of MODELS){
      data[id].time.push(iso);
      data[id].temperature_2m_previous_day1.push(temperature+(id==='gfs'?.1:4));
      data[id].precipitation_previous_day1.push(rain+(id==='gfs'?.1:2));
    }
  }
  return {id:'station'+index,name:'Estacao '+index,coords,observations,candidates:MODELS.map(id=>({id,hourly:data[id]}))};
}
function setPred(station,kind,when,model,value){
  const entry=station.candidates.find(x=>x.id===model).hourly;
  const key=kind==='temp'?'temperature_2m_previous_day1':'precipitation_previous_day1';
  const i=entry.time.indexOf(when);entry[key][i]=value;
}
test('gera pontuacao macro com dados de tres estacoes e amostras reservadas',()=>{
  const result=net.evaluate([exampleStation(0),exampleStation(1),exampleStation(2)]);
  assert.equal(result.stationCount,3);
  assert.equal(result.temp.validStations,3);
  assert.equal(result.temp.modelIds.length,4);
  assert.equal(result.temp.stations.length,3);
  assert.equal(result.temp.stations[0].trainStations,2);
  assert.equal(result.temp.stations[0].holdoutHours,48);
  assert.equal(result.temp.stations[0].holdoutStart,'2026-08-09');
  assert.ok(result.temp.tunedMae<result.temp.baseMae);
  assert.equal(result.temp.eligible,true);
  assert.ok(result.rain.tunedMae<result.rain.baseMae);
  assert.ok(result.rain.models[0].id==='gfs');
});
test('desconsidera dados das 48 horas de teste das outras estacoes no treinamento',()=>{
  const stations=[exampleStation(0),exampleStation(1),exampleStation(2)];
  const base=net.evaluate(stations);
  const weights=base.temp.stations.find(s=>s.id==='station0').weights;
  const altered=stations[1].observations.at(-1).time;
  setPred(stations[1],'temp',altered,'gfs',-30);
  const recompute=net.evaluate(stations);
  assert.deepEqual(recompute.temp.stations.find(s=>s.id==='station0').weights,weights);
});
test('bloqueia arquivos de estacoes a menos de dez quilometros',()=>{
  const a=exampleStation(0),b=exampleStation(1),c=exampleStation(2);
  b.coords={lat:a.coords.lat+.01,lon:a.coords.lon+.01};
  assert.throws(()=>net.evaluate([a,b,c]),/10 km/);
});
test('bloqueia rede insuficiente em vez de inventar ganhos',()=>{
  const a=exampleStation(0,3),b=exampleStation(1,3),c=exampleStation(2,3);
  const result=net.evaluate([a,b,c]);
  assert.equal(result.temp.eligible,false);
  assert.equal(result.temp.validStations,0);
});
test('limita os modelos aos presentes em todas as estacoes',()=>{
  const stations=[exampleStation(0),exampleStation(1),exampleStation(2)];
  stations[1].candidates=stations[1].candidates.filter(m=>m.id!=='gem');
  const r=net.evaluate(stations);
  assert.deepEqual(r.temp.modelIds,['ecmwf','gfs','icon']);
});
test('protege dados nao numericos e estacoes repetidas',()=>{
  const a=exampleStation(0),b=exampleStation(1),c=exampleStation(2);
  assert.throws(()=>net.evaluate([a,b,c,a]),/duplicadas|10 km/);
  assert.throws(()=>net.evaluate([a,b]),/3 a 8/);
});
test('agrega MAE por estacao, nao pelo numero de horarios',()=>{
  const stations=[exampleStation(0,8),exampleStation(1,10),exampleStation(2,12)];
  const r=net.evaluate(stations);
  const valid=r.temp.stations.filter(s=>s.valid);
  assert.equal(valid.length,3);
  const macro=valid.reduce((sum,s)=>sum+s.baseMae,0)/valid.length;
  assert.ok(Math.abs(macro-r.temp.baseMae)<1e-9);
});
