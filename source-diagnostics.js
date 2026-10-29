(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClimaSourceDiagnostics=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';const finite=x=>typeof x==='number'&&Number.isFinite(x),key=x=>String(x??'').slice(0,13);
 function inspect(data,targetTime,id,label,elapsedMs=null){
  const base={id,label,elapsedMs:finite(elapsedMs)?Math.max(0,Math.round(elapsedMs)):null},h=data?.hourly;
  if(!Array.isArray(h?.time)||!Array.isArray(h?.temperature_2m))return {...base,status:'invalid',usable:false,temp:false,rain24:false,rainHours:0,reason:'Série horária ausente'};
  const exact=h.time.findIndex(t=>key(t)===key(targetTime));
  if(exact<0)return {...base,status:'invalid',usable:false,temp:false,rain24:false,rainHours:0,reason:'Sem horário equivalente à referência'};
  const temp=finite(h.temperature_2m[exact])||(key(data?.current?.time)===key(targetTime)&&finite(data?.current?.temperature_2m));
  let rainHours=0;const epoch=Date.parse(h.time[exact]+':00Z');
  if(Number.isFinite(epoch))for(let i=0;i<24&&exact+i<h.time.length;i++){
   const timestamp=Date.parse(h.time[exact+i]+':00Z'),rain=h.precipitation?.[exact+i];
   if(timestamp!==epoch+i*3600000||!finite(rain)||rain<0)break;
   rainHours++;
  }
  const rain24=rainHours===24,usable=temp||rain24,status=!usable?'invalid':temp&&rain24?'ok':'partial';
  const reason=status==='ok'?'Temperatura e chuva 24h completas':!temp&&!rain24?'Sem temperatura e chuva 24h válidas':!temp?'Temperatura indisponível':`Chuva parcial (${rainHours}/24 h)`;
  return {...base,status,usable,temp,rain24,rainHours,reason};
 }
 function failed(id,label,error,elapsedMs=null){
  const msg=String(error?.message||error||'Falha').slice(0,100);
  const reason=/abort|time.?out|tempo/i.test(msg)?'Tempo de consulta excedido':/HTTP\s*429/i.test(msg)?'Limite de requisições atingido':/HTTP\s*5\d\d/i.test(msg)?'Falha temporária do servidor':'Falha na comunicação';
  return {id,label,elapsedMs:finite(elapsedMs)?Math.max(0,Math.round(elapsedMs)):null,status:'error',usable:false,temp:false,rain24:false,rainHours:0,reason};
 }
 function summarize(reports){const a=reports.filter(r=>r.id!=='bestmatch');
  return {temperatureIndependent:a.filter(r=>r.temp).length,rainfallIndependent:a.filter(r=>r.rain24).length,failed:reports.filter(r=>r.status==='error').length,totalIndependent:a.length};
 }
 return {inspect,failed,summarize};
});