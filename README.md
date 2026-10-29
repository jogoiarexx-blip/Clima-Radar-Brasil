# ClimaRadar Brasil — MVP 0.1

Site meteorológico **estático** (HTML, CSS, JS) pronto para colocar no GitHub Pages ou abrir em servidor HTTP local.

## Funcionalidades

- Pesquisa por municípios brasileiros (Open-Meteo Geocoding / GeoNames).
- Previsão atual **estimada por modelo**: temperatura, sensação, umidade, vento, chuva.
- Gráfico horário com temperatura e probabilidade de chuva; cartões de 7 dias.
- Comparação independente de 3 modelos: ECMWF IFS (resolução aberta), NOAA GFS e DWD ICON Global.
- Indicador de **divergência entre modelos**, que não deve ser confundido com a precisão histórica.
- Acesso ao radar do IPMet, avisos oficiais do INMET, CPTEC e MSN via links externos.
- Geolocalização apenas quando o visitante clicar para permitir; memorização local da cidade no browser.

## Publicação no GitHub Pages

1. Crie um repositório GitHub, por exemplo `climaradar-brasil`.
2. Envie `index.html`, `styles.css` e `app.js` para a raiz do repositório.
3. Em Settings → Pages → Build and deployment, selecione Deploy from a branch, `main`, `/ (root)` e salve.
4. Acesse a URL do Pages exibida pelo GitHub. Navegadores exigem HTTPS para geolocalização, e GitHub Pages fornece HTTPS.

Para testar localmente, na pasta do projeto execute `python -m http.server 8000` e abra `http://localhost:8000`.

## Transparência e limitações

- **Não é um sistema de nowcasting próprio**: por enquanto o radar IPMet abre no site original. Alguns produtos IPMet têm termos que **proíbem redistribuir imagens**. Negociar permissão/API antes de usar imagens no ClimaRadar.
- **Não inclui API da MSN**. MSN é uma inspiração de interface e um link para comparação manual. Não fazer scraping nem usar endpoints privados da Microsoft.
- **Dados atuais são modelados**, não leituras de estação. Na fase seguinte será importante integrar observações do INMET e avaliar a distância e a qualidade da estação.
- Os indicadores de consenso descrevem apenas amplitude das diferenças, **não confiança probabilística calibrada**, acurácia ou nowcast.
- A infraestrutura não possui backend ou armazenamento central. Não há ainda avaliação de previsões passadas, correção por viés, previsão de deslocamento de radar, alertas automáticos ou push.
- A disponibilidade dos modelos depende da API e de seus próprios ciclos e restrições; um modelo pode aparecer como "Indisponível" sem quebrar o site todo.
- APIs Open-Meteo são gratuitas sem chave para **uso não comercial** dentro dos limites publicados (consulte a política atual antes de monetizar), e exigem crédito conforme CC BY 4.0. Para operação comercial use plano apropriado.
- Alertas oficiais devem ser conferidos diretamente em https://avisos.inmet.gov.br/.

## Estrutura

```
climaradar-brasil/
  index.html
  styles.css
  app.js
  README.md
```

## Evolução técnica recomendada

1. Backend (Cloudflare Worker ou equivalente) com cache por grade/cidade, ingestão com licença validada de estações INMET e logs de atualização de fonte.
2. Conjunto de validação (previsão emitida antes do evento × observado na hora). Medir MAE de temperatura, Brier Score para chuva, calibração, scores por cidade, horizonte e horário.
3. Pesos dinamicamente calibrados por região, sazonalidade e horizonte. Registrar baseline de cada modelo para provar que o híbrido realmente melhorou, evitando leakage e distinguindo previsão de análise posterior.
4. Nowcasting de 0–2 horas com dados raster do radar (sob permissão ou fonte aberta), processamento de movimento de ecos e verificação por pluviômetros.
5. Integração de alertas oficiais com identificação de municípios afetados e histórico auditável, para não gerar avisos inventados.

## Fontes e documentação

- Open-Meteo: https://open-meteo.com/en/docs
- ECMWF: https://open-meteo.com/en/docs/ecmwf-api
- GFS: https://open-meteo.com/en/docs/gfs-api
- DWD ICON: https://open-meteo.com/en/docs/dwd-api
- Geocoding: https://open-meteo.com/en/docs/geocoding-api
- IPMet: https://www.ipmetradar.com.br/home/webadm/2mobileGis.php
- IPMet Termos: https://produtos.ipmetradar.com.br/usersc/join.php
- Alertas INMET: https://avisos.inmet.gov.br/
- CPTEC: https://www.cptec.inpe.br/
