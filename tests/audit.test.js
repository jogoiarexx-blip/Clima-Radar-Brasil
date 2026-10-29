'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { numeric, dateUtc, hour, csvLine, parseObservations, evaluate, distanceKm } = require('../audit-core.js');

test('números brasileiros e falhas de sensores não viram observações', () => {
  assert.equal(numeric('24,3'), 24.3);
  assert.equal(numeric('-2,1'), -2.1);
  assert.equal(numeric('9999,0'), null);
  assert.equal(numeric('NULL'), null);
  assert.equal(numeric(''), null);
  assert.equal(numeric('abc'), null);
});
test('CSV com aspas e delimitadores', () => {
  assert.deepEqual(csvLine('"A;B";"23,3";x', ';'), ['A;B','23,3','x']);
});
test('datas UTC não aceitam dia inexistente e horas inválidas', () => {
  assert.equal(dateUtc('2026/10/25'), '2026-10-25');
  assert.equal(dateUtc('25/10/2026'), '2026-10-25');
  assert.equal(dateUtc('2026-02-30'), null);
  assert.deepEqual(hour('0900 UTC'), {h:9,m:0});
  assert.deepEqual(hour('9:00'), {h:9,m:0});
  assert.equal(hour('2500 UTC'), null);
});
test('CSV INMET: cabeçalho metadados + leituras horárias UTC', () => {
  const csv = `REGIAO:;SE
UF:;SP
ESTACAO:;ESTACAO TESTE
CODIGO (WMO):;A999
LATITUDE:;-20,7123
LONGITUDE:;-48,092
ALTITUDE:;500
DATA DE FUNDACAO:;2010
Data;Hora UTC;PRECIPITAÇÃO TOTAL, HORÁRIO (mm);TEMPERATURA DO AR - BULBO SECO, HORARIA (°C)
2026/10/25;0000 UTC;0;24,3
2026/10/25;0100 UTC;9999;23,6
2026/10/25;0200 UTC;0,6;9999,0
2026/10/25;0300 UTC;NULL;NULL
2026/10/25;9999 UTC;1;22
`;
  const station = parseObservations(csv);
  assert.equal(station.station, 'ESTACAO TESTE');
  assert.equal(station.code, 'A999');
  assert.equal(station.latitude, -20.7123);
  assert.equal(station.longitude, -48.092);
  assert.equal(station.observations.length, 3);
  assert.equal(station.invalid, 1);
  assert.equal(station.ignored, 1);
  assert.deepEqual(station.observations[0], {time:'2026-10-25T00:00',temp:24.3,rain:0});
  assert.deepEqual(station.observations[2], {time:'2026-10-25T02:00',temp:null,rain:0.6});
});
test('erros absolutos, viés, chuva e horários calculados sem vazamento de previsão futura', () => {
  const obs = [
    {time:'2026-10-25T00:00', temp:24, rain:0},
    {time:'2026-10-25T01:00', temp:26, rain:1},
    {time:'2026-10-25T02:00', temp:null, rain:0.2}
  ];
  const hourly = {
    time:['2026-10-25T00:00','2026-10-25T01:00','2026-10-25T02:00'],
    temperature_2m_previous_day1:[25,24,20],
    precipitation_previous_day1:[0,0.5,0.4]
  };
  const out = evaluate(obs,hourly,1);
  assert.equal(out.nTemp, 2);
  assert.equal(out.tempMae, 1.5);
  assert.equal(out.tempBias, -0.5);
  assert.equal(out.nRain,3);
  assert.ok(Math.abs(out.rainMae - 0.7/3) < 1e-12);
  assert.equal(out.rainHitRate,100);
  assert.equal(out.rainyHours,2);
});
test('erros: modelos com campos ausentes não geram MAE fictício', () => {
  assert.deepEqual(evaluate([{time:'2026-10-25T00:00',temp:22,rain:0}],{time:['2026-10-25T00:00']},2),{
    nTemp:0,tempMae:null,tempBias:null,nRain:0,rainMae:null,rainHitRate:null,rainyHours:0,wetHours:0,rainMaeWet:null
  });
});
test('geodistância da mesma posição é zero', () => {
  assert.equal(distanceKm(-20,-48,-20,-48),0);
  assert.ok(distanceKm(-20,-48,-21,-48)>100);
});

test('comparação usa somente as mesmas horas observadas nos modelos',()=>{
  const {evaluateComparable}=require('../audit-core.js');
  const times=Array.from({length:80},(_,i)=>new Date(Date.UTC(2026,9,20,0,0)+i*3600000).toISOString().slice(0,16));
  const observations=times.map((time,i)=>({time,temp:20+i/10,rain:i%9===0?1:0}));
  const a={id:'ecmwf',hourly:{time:times,temperature_2m_previous_day1:times.map((_,i)=>20+i/10),precipitation_previous_day1:times.map(()=>0)}};
  const b={id:'gfs',hourly:{time:times,temperature_2m_previous_day1:times.map((_,i)=>i<10?null:21+i/10),precipitation_previous_day1:times.map((_,i)=>i<10?null:0.1)}};
  const result=evaluateComparable(observations,[a,b],1);
  assert.equal(result.commonTempHours,70);
  assert.equal(result.commonRainHours,70);
  assert.deepEqual(result.rows.map(x=>x.result.nTemp),[70,70]);
  assert.ok(Math.abs(result.rows[0].result.tempMae)<0.0000001);
  assert.ok(Math.abs(result.rows[1].result.tempMae-1)<0.0000001);
  assert.ok(result.rows[0].result.wetHours>0);
});
test('comparação não inventa desempenho quando não há horas comuns',()=>{
  const {evaluateComparable}=require('../audit-core.js');
  const time=Array.from({length:48},(_,i)=>new Date(Date.UTC(2026,9,20)+i*3600000).toISOString().slice(0,16));
  const obs=time.map(t=>({time:t,temp:21,rain:0}));
  const a={id:'ecmwf',hourly:{time:time.slice(0,24),temperature_2m_previous_day1:Array(24).fill(21),precipitation_previous_day1:Array(24).fill(0)}};
  const b={id:'gfs',hourly:{time:time.slice(24),temperature_2m_previous_day1:Array(24).fill(21),precipitation_previous_day1:Array(24).fill(0)}};
  const report=evaluateComparable(obs,[a,b],1);
  assert.equal(report.commonTempHours,0);
  assert.equal(report.commonRainHours,0);
  assert.deepEqual(report.rows.map(r=>r.result.nTemp),[0,0]);
});
