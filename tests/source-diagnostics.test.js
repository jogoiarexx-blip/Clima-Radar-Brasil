const test=require('node:test'),assert=require('node:assert/strict'),d=require('../source-diagnostics.js'),c=require('../forecast-core.js');
const time=Array.from({length:25},(_,i)=>new Date(Date.UTC(2026,9,29,i)).toISOString().slice(0,16));
const make=()=>({hourly:{time:[...time],temperature_2m:Array(25).fill(26),precipitation:Array(25).fill(0)}});
test('não usa hora seguinte',()=>{const p=make();for(const k in p.hourly)p.hourly[k].shift();assert.equal(d.inspect(p,time[0],'gfs','GFS').status,'invalid');assert.throws(()=>c.summary(p,'gfs','GFS',time[0]),/Sem horas disponíveis/);});
test('chuva 24h exige horas seguidas',()=>{const p=make();p.hourly.time[8]=time[9];assert.equal(d.inspect(p,time[0],'gfs','GFS').rain24,false);assert.equal(c.summary(p,'gfs','GFS',time[0]).rain24,null);});
test('ausente não vira zero',()=>{const p=make();p.hourly.precipitation[7]=null;assert.equal(d.inspect(p,time[0],'gem','GEM').status,'partial');});
test('referência não é modelo independente',()=>{const a=[d.inspect(make(),time[0],'bestmatch','Best Match'),d.inspect(make(),time[0],'gem','GEM'),d.failed('gfs','GFS','HTTP 503')];assert.equal(d.summarize(a).temperatureIndependent,1);assert.equal(d.summarize(a).failed,1);});
test('distingue timeout e limites',()=>{assert.match(d.failed('a','A','HTTP 429').reason,/Limite/);assert.match(d.failed('a','A','AbortError').reason,/Tempo/);});