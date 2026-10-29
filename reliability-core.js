/* Diagnóstico da disponibilidade das previsões, sem dependências externas. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClimaReliability=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 function observationAgeMinutes(payload,now=Date.now()){
   const time=payload?.current?.time,offset=payload?.utc_offset_seconds;
   if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(String(time))||!finite(offset)||Math.abs(offset)>50400)return null;
   const observed=Date.parse(time+'Z')-offset*1000;
   return Number.isFinite(observed)?Math.round((now-observed)/60000):null;
 }
 function assessPrimary(payload,now=Date.now()){
   const h=payload?.hourly;
   if(!payload?.current||!Array.isArray(h?.time)||!Array.isArray(h?.temperature_2m)||!Array.isArray(payload?.daily?.time))
     return {ok:false,reason:'Resposta incompleta da previsão principal.',ageMinutes:null};
   if(!finite(payload.current.temperature_2m))return {ok:false,reason:'Temperatura atual indisponível na fonte principal.',ageMinutes:null};
   const ageMinutes=observationAgeMinutes(payload,now);
   if(ageMinutes!==null&&(ageMinutes>180||ageMinutes< -90))
     return {ok:false,reason:'A previsão retornou uma leitura desatualizada ou com horário inconsistente.',ageMinutes};
   return {ok:true,reason:ageMinutes===null?'Horário da fonte não verificável.':'Dados recentes da fonte principal.',ageMinutes};
 }
 function sourceCoverage(models,configs){
   const available=new Set(models.filter(m=>m&&finite(m.temp)).map(m=>m.id));
   return {count:available.size,total:configs.length,unavailable:configs.filter(c=>!available.has(c.id)).map(c=>c.label)};
 }
 function shouldRefresh(lastSuccessAt,lastAttemptAt,now,{freshAfter=30*60000,retryAfter=5*60000}={}){
   if(!Number.isFinite(now)||now<0)return false;
   if(Number.isFinite(lastAttemptAt)&&lastAttemptAt>0&&now-lastAttemptAt<retryAfter)return false;
   return !Number.isFinite(lastSuccessAt)||lastSuccessAt<=0||now-lastSuccessAt>=freshAfter;
 }
 return {observationAgeMinutes,assessPrimary,sourceCoverage,shouldRefresh};
});