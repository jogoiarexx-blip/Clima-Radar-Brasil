"""Smoke no navegador do laboratorio multiestacao, isolado de API externa."""
from pathlib import Path
from datetime import datetime,timedelta,timezone
import json,base64
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf8')
css=(root/'styles.css').read_text(encoding='utf8')+'\n'+(root/'premium.css').read_text(encoding='utf8')
html=html.replace('<link rel="stylesheet" href="./styles.css" />','<style>'+css+'</style>').replace('<link rel="stylesheet" href="./premium.css" />','')
for file in (root/'assets').glob('*.svg'):
    html=html.replace('./assets/'+file.name,'data:image/svg+xml;base64,'+base64.b64encode(file.read_bytes()).decode())
models=['ecmwf_ifs','ncep_gfs_seamless','icon_global','cmc_gem_seamless']
base=datetime.now(timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)-timedelta(days=10)
times=[(base+timedelta(hours=i)).strftime('%Y-%m-%dT%H:%M') for i in range(240)]
forecast_times=[(datetime.now(timezone.utc)+timedelta(hours=i)).strftime('%Y-%m-%dT%H:00') for i in range(168)]
dates=[(datetime.now(timezone.utc)+timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]
primary={'current':{'time':forecast_times[0],'temperature_2m':25,'apparent_temperature':27,'relative_humidity_2m':60,'precipitation':0,'weather_code':3,'wind_speed_10m':12},'hourly':{'time':forecast_times,'temperature_2m':[25]*168,'precipitation':[0]*168,'precipitation_probability':[25]*168,'weather_code':[3]*168},'daily':{'time':dates,'weather_code':[3]*7,'temperature_2m_max':[31]*7,'temperature_2m_min':[20]*7,'precipitation_probability_max':[30]*7}}
archives={}
files=[]
for s in range(3):
    lat=-20.5+s*2.5;lon=-48+s*2.5
    csv=f'ESTACAO:;ESTACAO {s}\nUF:;{["SP","MG","GO"][s]}\nCODIGO (WMO):;A{s}01\nLATITUDE:;{lat}\nLONGITUDE:;{lon}\nData;Hora UTC;PRECIPITAÇÃO TOTAL, HORÁRIO (mm);TEMPERATURA DO AR - BULBO SECO, HORARIA (°C)\n'
    for i,t in enumerate(times):
        d=datetime.strptime(t,'%Y-%m-%dT%H:%M')
        csv+=f'{d.strftime("%Y/%m/%d")};{d.strftime("%H%M")} UTC;'+('3,0' if i%6==0 else '0')+';25,0\n'
    files.append({'name':f'estacao-{s}.csv','mimeType':'text/csv','buffer':csv.encode('utf8')})
    for k,model in enumerate(models):
        archives[f'{lat:.1f}|{model}']={'time':times,
          'temperature_2m_previous_day1':[25.1 if k==1 else 29]*240,
          'precipitation_previous_day1':[(3 if i%6==0 else 0)+(0.1 if k==1 else 2) for i in range(240)]}
        for lead in (2,3):
            archives[f'{lat:.1f}|{model}'][f'temperature_2m_previous_day{lead}']=[25.1 if k==1 else 29]*240
            archives[f'{lat:.1f}|{model}'][f'precipitation_previous_day{lead}']=[(3 if i%6==0 else 0)+(0.1 if k==1 else 2) for i in range(240)]
shim='''<script>
const ARCHIVE=__ARCHIVE__;const MAIN=__MAIN__;
window.fetch=async(input)=>{const u=new URL(input);if(u.hostname==='previous-runs-api.open-meteo.com'){
  const id=(Number(u.searchParams.get('latitude'))).toFixed(1)+'|'+u.searchParams.get('models');
  return {ok:true,json:async()=>({hourly:ARCHIVE[id]})};
}
if(u.pathname.includes('/weather-maps.json'))return {ok:true,json:async()=>({host:'https://tilecache.rainviewer.com',radar:{past:[]}})};
if(u.pathname.includes('/search'))return {ok:true,json:async()=>({results:[]})};
return {ok:true,json:async()=>MAIN};};</script>'''.replace('__ARCHIVE__',json.dumps(archives)).replace('__MAIN__',json.dumps(primary))
html=html.replace('</head>',shim+'\n</head>')
for name in ['forecast-core.js','reliability-core.js','source-diagnostics.js','app.js','model-compare.js','audit-core.js','validation-core.js','audit-ui.js','network-core.js','regional-core.js','robustness-core.js','network-ui.js','radar-core.js','radar.js','mobile.js']:
    html=html.replace(f'<script src="./{name}" defer></script>','<script>'+(root/name).read_text(encoding='utf8')+'</script>')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
    page=browser.new_page(viewport={'width':1200,'height':900})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(html,wait_until='domcontentloaded')
    page.locator('#networkCsv').set_input_files(files)
    page.locator('#networkLead').select_option('0')
    page.locator('#networkCompare').click()
    page.wait_for_function("document.querySelector('#networkRows')?.children.length === 3",timeout=25000)
    result=page.evaluate("""() => ({result:document.querySelector('#networkResult').className,rows:document.querySelectorAll('#networkRows tr').length,summary:document.querySelector('#networkHeadline').textContent,export:!document.querySelector('#networkExport').disabled,scrollWidth:document.documentElement.scrollWidth})""")
    assert result['rows']==3 and result['export'] and not errors,(result,errors)
    robustness=page.locator('#networkRobustnessCards').inner_text()
    assert '3/3 estações melhoraram' in robustness and 'Amostra pequena' in robustness, robustness
    assert page.locator('.network-robustness-card').count()==2
    coverage=page.locator('#regionalCoverage').inner_text()
    assert '3 UF(s) identificada(s)' in coverage, coverage
    page.locator('#networkResultLead').select_option('3')
    assert '72h antes' in page.locator('#networkHeadline').inner_text()
    page.locator('#regionalMetric').select_option('rain')
    assert page.locator('#regionalRows tr').count() == 6
    print('Relatório regional:',coverage,'linhas:',page.locator('#regionalRows tr').count())
    print('Auditoria multiestacao no navegador:',result,'erros JS:',len(errors))
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(150)
    layout=page.evaluate("() => ({width:document.documentElement.scrollWidth, viewport:innerWidth, table:document.querySelector('.regional-table')?.scrollWidth})")
    assert layout['width']<=layout['viewport'], layout
    print('Relatório mobile:', layout)
    browser.close()
