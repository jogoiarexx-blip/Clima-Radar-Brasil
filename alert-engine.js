/* ClimaRadar: regras preventivas não oficiais; aviso INMET só por município confirmado. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.ClimaAlerts=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const UF={"SAO PAULO":"SP","MINAS GERAIS":"MG","RIO DE JANEIRO":"RJ","ESPIRITO SANTO":"ES","PARANA":"PR","SANTA CATARINA":"SC","RIO GRANDE DO SUL":"RS","MATO GROSSO":"MT","MATO GROSSO DO SUL":"MS","GOIAS":"GO","DISTRITO FEDERAL":"DF","TOCANTINS":"TO","PARA":"PA","AMAPA":"AP","AMAZONAS":"AM","RORAIMA":"RR","RONDONIA":"RO","ACRE":"AC","MARANHAO":"MA","PIAUI":"PI","CEARA":"CE","RIO GRANDE DO NORTE":"RN","PARAIBA":"PB","PERNAMBUCO":"PE","ALAGOAS":"AL","SERGIPE":"SE","BAHIA":"BA"};
const normalize=x=>String(x??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toUpperCase();
function getUf(x){const a=normalize(x);return /^[A-Z]{2}$/.test(a)&&Object.values(UF).includes(a)?a:UF[a]||null;}
function hourRisk(data,opts={}){
 const h=data?.hourly||{},times=h.time,now=String(opts.currentTime||data?.current?.time||"").slice(0,13);
 if(!Array.isArray(times)||!times.length||!now)return {items:[],status:"unavailable",inspectedHours:0};
 const start=times.findIndex(t=>String(t).slice(0,13)>=now);
 if(start<0)return {items:[],status:"stale",inspectedHours:0};
 const hours=Number.isInteger(opts.hours)?Math.min(72,Math.max(1,opts.hours)):48;
 const count=Math.min(hours,times.length-start),all=[],rolling=[],available={rain:0,wind:0,weather:0};
 for(let k=0;k<count;k++){
  const i=start+k,time=times[i],code=h.weather_code?.[i],mm=h.precipitation?.[i],gust=h.wind_gusts_10m?.[i];
  if(finite(code)){available.weather++;if([95,96,99].includes(code))all.push({kind:"storm",level:code===95?"moderate":"high",time,reason:code===95?"Código meteorológico de tempestade":"Código de tempestade com possível granizo"});}
  if(finite(mm)&&mm>=0){available.rain++;if(mm>=10)all.push({kind:"rain",level:mm>=20?"high":"moderate",time,reason:"Chuva de "+mm.toFixed(1)+" mm/h prevista"});}
  if(finite(gust)&&gust>=0){available.wind++;if(gust>=60)all.push({kind:"wind",level:gust>=85?"high":"moderate",time,reason:"Rajada prevista de "+Math.round(gust)+" km/h"});}
  rolling.push(finite(mm)&&mm>=0?mm:null);
  if(k>=23){const last=rolling.slice(k-23,k+1);if(last.every(n=>n!==null)){const total=last.reduce((a,b)=>a+b,0);if(total>=50)all.push({kind:"rain",level:total>=100?"high":"moderate",time,reason:"Acumulado previsto de "+total.toFixed(1)+" mm em 24h"});}}
 }
 const grouped=new Map();
 for(const e of all){const prev=grouped.get(e.kind);if(!prev)grouped.set(e.kind,{...e});else if(prev.level!=="high"&&e.level==="high")grouped.set(e.kind,{...e});}
 const items=[...grouped.values()].sort((a,b)=>Number(b.level==="high")-Number(a.level==="high"));
 const values=Object.values(available);
 const status=values.every(n=>n===0)?"unavailable":values.some(n=>n===0)?"partial":"ok";
 return {items,status,inspectedHours:count,availability:available};
}
function cityArray(data){if(Array.isArray(data))return data;for(const key of ["cidades","municipios","data","results"])if(Array.isArray(data?.[key]))return data[key];return [];}
function resolveCity(data,place){
 const name=normalize(place?.name||""),uf=getUf(place?.admin1||place?.uf||place?.estado);
 if(!name||name.includes("SUA LOCALIZACAO")||!uf)return null;
 const matches=cityArray(data).filter(x=>normalize(x.nome||x.name||x.cidade||x.municipio)===name&&(!getUf(x.uf||x.estado)||getUf(x.uf||x.estado)===uf));
 if(matches.length!==1)return null;
 const x=matches[0],code=String(x.ibge??x.codigo_ibge??x.codigoIBGE??x.cod_ibge??x.codigo??"");
 if(!/^\d{7}$/.test(code))return null;
 const lat=Number(x.latitude??x.lat),lon=Number(x.longitude??x.lon??x.lng);
 if(finite(place.latitude)&&finite(place.longitude)&&finite(lat)&&finite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
  const rad=d=>d*Math.PI/180,a=Math.sin(rad(lat-place.latitude)/2)**2+Math.cos(rad(lat))*Math.cos(rad(place.latitude))*Math.sin(rad(lon-place.longitude)/2)**2;
  if(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))>65)return null;
 }
 return {ibge:code,uf,name:x.nome||x.name||place.name};
}
function official(data,city,now=Date.now()){
 if(!city?.ibge)return {status:"unverified",items:[]};
 if(!Array.isArray(data?.alertas))return {status:"unavailable",items:[]};
 const date=Date.parse(data.atualizado_em||"");
 if(!finite(date)||Math.abs(now-date)>65*60*1000)return {status:"stale",items:[]};
 const items=data.alertas.filter(x=>Array.isArray(x.geocodes)&&x.geocodes.some(code=>String(code)===city.ibge)).map(x=>({
 id:String(x.id??x.evento??""),title:String(x.evento||"Aviso meteorológico").slice(0,120),severity:String(x.severidade||"Não informada").slice(0,40),level:Math.min(3,Math.max(0,Number(x.nivel)||0)),
 start:String(x.inicio||""),end:String(x.fim||""),risks:Array.isArray(x.riscos)?x.riscos.slice(0,3).map(y=>String(y).slice(0,350)):[],instructions:Array.isArray(x.instrucoes)?x.instrucoes.slice(0,3).map(y=>String(y).slice(0,350)):[],future:!!x.futuro
 })).sort((a,b)=>b.level-a.level);
 return {status:"verified",items,updatedAt:data.atualizado_em};
}
return {hourRisk,resolveCity,official,getUf,normalize};
});