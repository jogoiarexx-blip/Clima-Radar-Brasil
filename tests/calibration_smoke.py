"""Teste sem internet do fluxo completo: arquivo INMET, Previous Runs e pesos."""
from pathlib import Path
from datetime import datetime, timedelta, timezone
import base64, json
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf8')
css=(root/'styles.css').read_text(encoding='utf8')+'\n'+(root/'premium.css').read_text(encoding='utf8')
html=html.replace('<link rel="stylesheet" href="./styles.css" />','<style>'+css+'</style>').replace('<link rel="stylesheet" href="./premium.css" />','')
for f in (root/'assets').glob('*.svg'):
    html=html.replace('./assets/'+f.name,'data:image/svg+xml;base64,'+base64.b64encode(f.read_bytes()).decode('ascii'))
now=datetime.now(timezone.utc)
start=now.replace(minute=0,second=0,microsecond=0)-timedelta(days=8)
station_times=[(start+timedelta(hours=i)).strftime('%Y-%m-%dT%H:%M') for i in range(160)]
forecast_times=[(now.replace(minute=0,second=0,microsecond=0)+timedelta(hours=i)).strftime('%Y-%m-%dT%H:%M') for i in range(168)]
dates=[(now+timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]
primary={"current":{"time":forecast_times[0],"temperature_2m":25,"apparent_temperature":27,"relative_humidity_2m":60,"precipitation":0,"weather_code":3,"wind_speed_10m":12},"hourly":{"time":forecast_times,"temperature_2m":[25]*168,"precipitation":[.3]*168,"precipitation_probability":[50]*168,"weather_code":[3]*168},"daily":{"time":dates,"weather_code":[3]*7,"temperature_2m_max":[31]*7,"temperature_2m_min":[20]*7,"precipitation_probability_max":[55]*7}}
models=['ecmwf_ifs','ncep_gfs_seamless','icon_global','cmc_gem_seamless']
archive={}
for n,model in enumerate(models):
    archive[model]={"hourly":{"time":station_times,"temperature_2m_previous_day1":[23.5 if n==0 else 28+n]*160,"precipitation_previous_day1":[(1.0 if i%12==0 else 0) if n==0 else (1.7+n*.1 if i%12==0 else .7+n*.1) for i in range(160)]}}
csv='''ESTACAO:;ESTACAO TESTE
LATITUDE:;-20,581
LONGITUDE:;-47,859
Data;Hora UTC;PRECIPITAÇÃO TOTAL, HORÁRIO (mm);TEMPERATURA DO AR - BULBO SECO, HORARIA (°C)
'''
for i,t in enumerate(station_times):
    dt=datetime.strptime(t,'%Y-%m-%dT%H:%M')
    csv+=f'{dt.strftime("%Y/%m/%d")};{dt.strftime("%H%M")} UTC;'+('1,0' if i%12==0 else '0')+';23,5\n'
script='''<script>
Object.defineProperty(window,'localStorage',{configurable:true,value:{db:{},getItem(k){return this.db[k]??null},setItem(k,v){this.db[k]=String(v)},removeItem(k){delete this.db[k]}}});
const MOCK_MAIN=__MAIN__;const MOCK_ARCHIVE=__ARCHIVE__;
window.fetch=async(input)=>{const u=new URL(input);if(u.hostname==='previous-runs-api.open-meteo.com')return {ok:true,json:async()=>MOCK_ARCHIVE[u.searchParams.get('models')]}; if(u.pathname.includes('/weather-maps.json'))return {ok:true,json:async()=>({host:'https://tilecache.rainviewer.com',radar:{past:[]}})};if(u.pathname.includes('/search'))return {ok:true,json:async()=>({results:[]})};return {ok:true,json:async()=>MOCK_MAIN};};
</script>'''.replace('__MAIN__',json.dumps(primary)).replace('__ARCHIVE__',json.dumps(archive))
html=html.replace('</head>',script+'\n</head>')
for filename in ['forecast-core.js','app.js','model-compare.js','audit-core.js','validation-core.js','audit-ui.js','radar-core.js','radar.js','mobile.js']:
    html=html.replace(f'<script src="./{filename}" defer></script>','<script>'+ (root/filename).read_text(encoding='utf8')+'</script>')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
    page=browser.new_page(viewport={'width':1200,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded')
    page.locator('#stationCsv').set_input_files(files={'name':'inmet.csv','mimeType':'text/csv','buffer':csv.encode('utf-8')})
    page.locator('#compareAudit').click()
    page.wait_for_function("document.querySelector('#auditBody')?.children.length === 4",timeout=15000)
    result=page.evaluate("""() => ({rows:document.querySelectorAll('#auditBody tr').length,scope:document.querySelector('#auditScope').textContent,calibrationEnabled:!document.querySelector('#applyAuditCalibration').disabled,error:document.querySelector('#auditStatus').textContent})""")
    assert result['rows']==4,result
    assert result['calibrationEnabled'],result
    assert page.locator('#holdoutMetrics .holdout-metric').count()==2
    assert 'Erro original' in page.locator('#holdoutMetrics').inner_text()
    page.locator('#applyAuditCalibration').click()
    page.wait_for_timeout(400)
    saved=page.evaluate("JSON.parse(localStorage.getItem('climaradar.audit.weights.v3'))")
    assert saved['version']==3 and len(saved['weights']['temp'])==4 and len(saved['weights']['rain'])==4,saved
    assert not errors,errors
    print('Fluxo INMET/4 modelos: OK; validação cronológica + calibração v3 temp/chuva: OK; erros JS:',len(errors))
    browser.close()
