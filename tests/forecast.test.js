const test=require('node:test');
const assert=require('node:assert/strict');
const fc=require('../forecast-core.js');
const times=Array.from({length:48},(_,i)=>`2026-10-${String(29+Math.floor(i/24)).padStart(2,'0')}T${String(i%24).padStart(2,'0')}:00`);
function data(temp=27,rain=0.4){return {current:{time:times[0],temperature_2m:temp,weather_code:2},hourly:{time:times,temperature_2m:times.map(()=>temp),precipitation:times.map(()=>rain),precipitation_probability:times.map(()=>60),weather_code:times.map(()=>2)}};}
test('alinha horários das séries sem deslocar índices',()=>{
 const d=data();d.hourly.temperature_2m[1]=19;
 const s=fc.summary(d,'gfs','GFS',times[1]);
 assert.equal(s.temp,19);assert.equal(s.time,times[1]);assert.equal(s.hourly.length,24);
});
test('não converte valores ausentes em chuva zero',()=>{
 const d=data();d.hourly.precipitation[6]=null;
 const s=fc.summary(d,'icon','ICON',times[0]);
 assert.equal(s.rain24,null);
});
test('uma única previsão não cria indicador numérico de concordância',()=>{
 const b=fc.summary(data(),'bestmatch','Ref',times[0]);const e=fc.summary(data(28),'ecmwf','EC',times[0]);
 const r=fc.ensemble(b,[e]);assert.equal(r.confidence,null);assert.equal(r.modelsOnline,1);assert.equal(r.summary.temp,b.temp);
});
test('concordância usa só modelos independentes, não Best Match',()=>{
 const b=fc.summary(data(44),'bestmatch','Ref',times[0]);
 const e=fc.summary(data(24),'ecmwf','EC',times[0]);const g=fc.summary(data(24.5),'gfs','GFS',times[0]);const i=fc.summary(data(25),'icon','ICON',times[0]);
 const m=fc.summary(data(24.25),'gem','GEM',times[0]);const r=fc.ensemble(b,[e,g,i,m]);assert.equal(r.modelsOnline,4);assert.ok(r.summary.temp>24&&r.summary.temp<25);assert.equal(r.tempSpread,1);assert.ok(r.agreement>75);
});
test('probabilidade de chuva vem da previsão publicada, sem percentual criado',()=>{
 const b=fc.summary(data(27,.3),'bestmatch','Ref',times[0]);
 const e=fc.summary(data(25,0),'ecmwf','EC',times[0]);const g=fc.summary(data(26,0),'gfs','GFS',times[0]);
 assert.equal(fc.ensemble(b,[e,g]).rainChance,60);
});
test('dados incompletos de um modelo não distorcem média de chuva',()=>{
 const b=fc.summary(data(27,1),'bestmatch','Ref',times[0]);
 const complete=fc.summary(data(25,1),'ecmwf','EC',times[0]);
 const d=data(26,0);d.hourly.precipitation.fill(null);
 const missing=fc.summary(d,'gfs','GF',times[0]);
 const r=fc.ensemble(b,[complete,missing]);assert.equal(r.summary.rain24,24);
});

test('calibração térmica não altera previsão de chuva',()=>{
 const reference=fc.summary(data(25,0.7),'bestmatch','BM',times[0]);
 const a=fc.summary(data(25,0),'ecmwf','EC',times[0]);
 const b=fc.summary(data(30,1),'gfs','GFS',times[0]);
 const base=fc.ensemble(reference,[a,b]);
 const modified=fc.ensemble(reference,[a,b],{version:3,validation:{temp:{eligible:true},rain:{eligible:false}},weights:{temp:{ecmwf:0.9,gfs:0.1},rain:null}});
 assert.ok(Math.abs(modified.summary.temp-base.summary.temp)>0.1);
 assert.ok(Math.abs(modified.summary.rain24-base.summary.rain24)<1e-10);
});
test('calibração de chuva não altera temperatura',()=>{
 const reference=fc.summary(data(25,0.7),'bestmatch','BM',times[0]);
 const a=fc.summary(data(25,0),'ecmwf','EC',times[0]);
 const b=fc.summary(data(30,1),'gfs','GFS',times[0]);
 const base=fc.ensemble(reference,[a,b]);
 const modified=fc.ensemble(reference,[a,b],{version:3,validation:{temp:{eligible:false},rain:{eligible:true}},weights:{temp:null,rain:{ecmwf:0.9,gfs:0.1}}});
 assert.ok(Math.abs(modified.summary.temp-base.summary.temp)<1e-10);
 assert.ok(Math.abs(modified.summary.rain24-base.summary.rain24)>0.1);
});
test('calibração antiga não interfere na versão atual',()=>{
 const reference=fc.summary(data(25,0),'bestmatch','BM',times[0]);
 const a=fc.summary(data(25,0),'ecmwf','EC',times[0]);
 const b=fc.summary(data(30,1),'gfs','GFS',times[0]);
 const baseline=fc.ensemble(reference,[a,b]);
 const old=fc.ensemble(reference,[a,b],{version:1,weights:{ecmwf:0.95,gfs:0.05}});
 assert.equal(old.summary.temp,baseline.summary.temp);
 assert.equal(old.summary.rain24,baseline.summary.rain24);
});

test('calibração v2 sem teste reservado não é aplicada no consenso v3',()=>{
 const reference=fc.summary(data(25,0.7),'bestmatch','BM',times[0]);
 const a=fc.summary(data(25,0),'ecmwf','EC',times[0]);
 const b=fc.summary(data(30,1),'gfs','GFS',times[0]);
 const base=fc.ensemble(reference,[a,b]);
 const old=fc.ensemble(reference,[a,b],{version:2,weights:{temp:{ecmwf:1,gfs:0},rain:null}});
 assert.equal(base.summary.temp,old.summary.temp);
 assert.equal(base.summary.rain24,old.summary.rain24);
});


test('pesos de chuva salvos não alteram chuva quando a validação reprovou chuva',()=>{
 const reference=fc.summary(data(27,0.5),'bestmatch','BM',times[0]);
 const a=fc.summary(data(27,0.1),'ecmwf','EC',times[0]);
 const b=fc.summary(data(30,2),'gfs','GFS',times[0]);
 const baseline=fc.ensemble(reference,[a,b]);
 const payload={version:3,validation:{temp:{eligible:true},rain:{eligible:false}},weights:{temp:{ecmwf:0.9,gfs:0.1},rain:{ecmwf:0.95,gfs:0.05}}};
 const actual=fc.ensemble(reference,[a,b],payload);
 assert.ok(Math.abs(actual.summary.temp-baseline.summary.temp)>0.1);
 assert.equal(actual.summary.rain24,baseline.summary.rain24);
});
test('pesos de temperatura salvos não alteram temperatura quando a validação reprovou temperatura',()=>{
 const reference=fc.summary(data(27,0.5),'bestmatch','BM',times[0]);
 const a=fc.summary(data(27,0.1),'ecmwf','EC',times[0]);
 const b=fc.summary(data(30,2),'gfs','GFS',times[0]);
 const baseline=fc.ensemble(reference,[a,b]);
 const payload={version:3,validation:{temp:{eligible:false},rain:{eligible:true}},weights:{temp:{ecmwf:0.95,gfs:0.05},rain:{ecmwf:0.9,gfs:0.1}}};
 const actual=fc.ensemble(reference,[a,b],payload);
 assert.equal(actual.summary.temp,baseline.summary.temp);
 assert.ok(Math.abs(actual.summary.rain24-baseline.summary.rain24)>0.1);
});
test('série encerrada não fornece leitura atual inventada',()=>{
 const d=data(27,0.2);
 assert.throws(()=>fc.summary(d,'ecmwf','EC','2026-12-10T12:00'),/Sem horas disponíveis/);
});
