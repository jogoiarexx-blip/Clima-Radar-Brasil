'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,commonRecords,evaluateVariable}=require('../validation-core.js');
function fixture(days=14,mode='consistent',rainy=true){
 const times=Array.from({length:days*24},(_,i)=>new Date(Date.UTC(2026,9,1)+i*3600000).toISOString().slice(0,16));
 const observations=times.map((time,i)=>({time,temp:20+Math.sin(i/6),rain:rainy&&(i%5===0)?2:0}));
 const ids=['ecmwf','gfs','icon','gem'];
 const offsets=[0.05,4,5,6];
 const candidates=ids.map((id,modelIndex)=>({
   id,hourly:{time:times,
     temperature_2m_previous_day1:times.map((_,i)=>observations[i].temp + (mode==='reverse'&&i>=days*24-48 ? [5,0.05,5,5][modelIndex]:offsets[modelIndex])),
     precipitation_previous_day1:times.map((_,i)=>{
       const obs=observations[i].rain;
       if(!rainy)return 0;
       const offset=mode==='reverse'&&i>=days*24-48?[1,0,1,1][modelIndex]:(modelIndex===0?0.03:0.7+modelIndex*0.15);
       return obs+offset;
     })
   }
 }));
 return {times,observations,candidates};
}
test('validação cronológica reserva dois dias e embarga 24h anteriores',()=>{
 const {observations,candidates}=fixture();
 const result=validate(observations,candidates,1);
 assert.equal(result.temp.holdoutHours,48);
 assert.equal(result.temp.trainHours,264);
 assert.equal(result.temp.embargoHours,24);
 assert.equal(result.temp.trainEnd,'2026-10-11');
 assert.equal(result.temp.holdoutStart,'2026-10-13');
 assert.equal(result.temp.modelCount,4);
});
test('pesos favorecendo modelo com erro menor só são aceitos se melhorarem no período reservado',()=>{
 const {observations,candidates}=fixture();
 const result=validate(observations,candidates,1);
 assert.equal(result.temp.eligible,true,JSON.stringify(result.temp));
 assert.ok(result.temp.tunedMae<result.temp.baseMae);
 assert.ok(result.temp.weights.ecmwf>result.temp.weights.gfs);
 assert.equal(result.rain.eligible,true,JSON.stringify(result.rain));
 assert.ok(result.rain.tunedMae<result.rain.baseMae);
 assert.ok(result.rain.tunedWetMae<=result.rain.baseWetMae);
});
test('não aceita pesos que só vencem na amostra de treino e perdem no futuro reservado',()=>{
 const {observations,candidates}=fixture(14,'reverse');
 const result=validate(observations,candidates,1);
 assert.equal(result.temp.eligible,false);
 assert.equal(result.rain.eligible,false);
 assert.ok(result.temp.tunedMae>=result.temp.baseMae);
});
test('sem eventos chuvosos suficientes a chuva não é calibrada',()=>{
 const {observations,candidates}=fixture(14,'consistent',false);
 const result=validate(observations,candidates,1);
 assert.equal(result.temp.eligible,true);
 assert.equal(result.rain.eligible,false);
 assert.match(result.rain.reason,/insuficiente/);
});
test('sem 72h treino e 24h de teste após embargo a validação é bloqueada',()=>{
 const {observations,candidates}=fixture(4);
 const result=validate(observations,candidates,1);
 assert.equal(result.temp.eligible,false);
 assert.equal(result.rain.eligible,false);
});
test('horas faltantes não viram observações de chuva nem fazem modelos serem misturados',()=>{
 const {observations,candidates}=fixture(14);
 candidates[0].hourly.precipitation_previous_day1.fill(null);
 const rain=commonRecords(observations,candidates,'rain',1);
 assert.equal(rain.ids.length,3);
 assert.equal(rain.rows.length,336);
 candidates[1].hourly.temperature_2m_previous_day1.fill(null);
 const temp=evaluateVariable(observations,candidates,'temp',1);
 assert.equal(temp.modelCount,3);
});
