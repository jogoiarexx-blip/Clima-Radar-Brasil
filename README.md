# ClimaRadar Brasil — v0.2 (auditoria de precisão)

Site meteorológico estático em **HTML, CSS e JavaScript**, preparado para hospedar no GitHub Pages, sem dependências de build. Esta é uma versão de desenvolvimento e não um sistema oficialmente certificado de previsão meteorológica.

## O que funciona

- Busca por cidades do Brasil, localização (mediante permissão), condições estimadas, chuva horária, gráfico de temperatura e previsão de 7 dias (Open-Meteo).
- Comparação isolada de três modelos: **ECMWF IFS HRES 9 km**, **NOAA GFS Seamless** e **DWD ICON Global**, com tolerância a falhas individuais. A passagem do ECMWF de 0,25° (v0.1) para 9 km nesta revisão não prova aumento de acurácia para todas as localidades.
- **Nova auditoria de precisão:** importa no próprio navegador um CSV horário de estação automática do INMET, interpreta campos comuns no formato original, extrai coordenadas quando disponíveis e descarta sentinelas `9999`, `NULL`, ausências, datas impossíveis e valores fora dos limites de plausibilidade.
- Consulta a **Previous Runs API** do Open-Meteo para três modelos, com antecedência de 24, 48 ou 72 horas, no endereço das **coordenadas da estação**, não da cidade.
- Medidas de **erro absoluto médio (MAE) e viés da temperatura (°C)**, erro médio de precipitação (mm/h), número de amostras e eventual indisponibilidade por modelo. Correlaciona horários por **UTC**; diferencia observações reais de previsões modeladas.
- Classifica menor MAE de temperatura **somente dentro da amostra avaliada**, com mínimo de 12 pares válidos. Não aplica correção automática aos modelos ainda; isso exigiria validação fora da amostra.
- Exportação em CSV do relatório de auditoria, com fonte, coordenadas, janela, horizonte e quantidade de observações.
- Acesso via links externos ao IPMet, avisos do INMET, CPTEC/INPE e MSN Clima; não redistribui produtos de radar.

## Site publicado no GitHub Pages

- Site: https://jogoiarexx-blip.github.io/Clima-Radar-Brasil/
- Repositório: https://github.com/jogoiarexx-blip/Clima-Radar-Brasil
- Publicação da v0.2: o **index.html da raiz é autocontido**, com CSS, lógica de previsão e auditoria embutidos. Ele funciona sem build ou dependências de arquivos JavaScript locais; os arquivos `app.js` e `styles.css` antigos presentes no repositório não são carregados por esta versão.
- O pacote modular completo da v0.2 contém `index.html`, `app.js`, `styles.css`, `audit-core.js`, `audit-ui.js` e testes, para desenvolvimento e futuras alterações.
- Fonte de publicação: branch `main`, diretório `/ (root)`, com deploy via GitHub Pages. O workflow do Pages pode levar algum tempo até refletir o commit mais recente.
- Geolocalização depende de HTTPS e permissão do navegador. APIs de terceiros exigem conectividade.

Para testar o arquivo de publicação localmente, abra `index.html` no navegador ou use um servidor HTTP local.

## Como utilizar a nova auditoria

1. Abra https://portal.inmet.gov.br/dadoshistoricos, escolha dados de **estação automática** e baixe o pacote ou dados da estação no formato CSV. Se for ZIP, descompacte primeiro e selecione **um CSV de estação**.
2. No site, navegue até **Auditoria meteorológica** e importe esse arquivo `.csv`. O navegador lê o arquivo localmente; não há upload para nossos servidores.
3. Confira latitude e longitude da estação. Se o cabeçalho não contiver as coordenadas, informe os números reais manualmente (não use as coordenadas do município automaticamente).
4. Escolha antecedência (24h, 48h ou 72h) e clique em **Comparar os três modelos**. A ferramenta avalia os últimos **14 dias presentes no arquivo** que não estejam no futuro (até 336 horas).
5. Veja a tabela com MAE, viés, erros de chuva, tamanho da amostra e status. Se desejar, salve o relatório CSV.

**Interpretação:** um MAE de 1,8°C significa erro absoluto médio de 1,8°C entre previsão e leitura, *naquele conjunto de horários e naquela estação*. Valores menores não significam automaticamente maior confiança probabilística, maior exatidão para todos os municípios, nem melhor desempenho futuro. Falhas de sensores e diferenças entre a célula do modelo e o sítio da estação influenciam a comparação. O INMET diz expressamente que observações automáticas são brutas e não passam por validação prévia.

## Restrições e cuidados de produção

- **API do INMET:** não prometemos ingestão automática ao vivo. A disponibilidade pública e o CORS da API para observações têm variado; importação local evita depender desses endpoints. Para integração de produção, contate `api@inmet.gov.br` ou use um backend autorizado.
- **Previous Runs API:** requer internet e disponibilidade de previsões arquivadas. Algumas estações ou modelos/datas podem não ter dados suficientes. A ferramenta **não foi validada end-to-end contra essa API neste ambiente**; os testes executados verificam o parser e os cálculos localmente. A seleção usa `temperature_2m_previous_day{1,2,3}` e `precipitation_previous_day{1,2,3}`; cada sufixo identifica a previsão feita 24/48/72h antes, conforme documentação.
- **Chuva horária:** previsões de precipitação representam o período horário anterior ao timestamp, compatível conceitualmente com o acumulado horário do INMET, mas convenções específicas de estações, período e limites espaciais exigem conferência.
- **IPMet:** radar apenas por link externo — não há autorização presumida para copiar mapas ou redistribuir imagens.
- **INMET:** valores `9999`, NULL ou vazios representam falhas; o formato dos CSVs pode mudar. Coordenadas e horário são essenciais. Dados automáticos são brutos, sujeitos a inconsistências.
- **Licenças:** Open-Meteo fornece API gratuita sem chave para usos não comerciais dentro dos limites de uso; operação comercial deve contratar licença/plano apropriado. Atribuição de fonte permanece no rodapé. INMET e IPMet têm termos próprios.
- Sem backend, banco de dados, ETL, calibração baseada em previsão validada, nowcasting próprio de radar ou avisos oficiais integrados por área. A auditoria não altera a previsão principal.

## Testes reproduzíveis

Com Node.js instalado:

```bash
node --test tests/audit.test.js
node --check app.js
node --check audit-ui.js
```

Cobertura: CSV com metadados de estação, acentos e vírgula decimal; valores faltantes ou suspeitos; horários UTC; datas impossíveis; métricas de erro; entrada ausente de modelo; distância espacial. Testes com dados fictícios são **testes unitários**, não prova de precisão meteorológica ou de disponibilidade de API.

## Fontes

- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- ECMWF 9 km: https://open-meteo.com/en/docs/ecmwf-api
- Previous Runs: https://open-meteo.com/en/docs/previous-runs-api
- INMET: https://portal.inmet.gov.br/noticias/saiba-como-acessar-os-dados-meteorol%C3%B3gicos-dispon%C3%ADveis-no-site-do-inmet
- Dados históricos INMET: https://portal.inmet.gov.br/dadoshistoricos
- IPMet: https://www.ipmetradar.com.br/home/webadm/2mobileGis.php
- Alertas oficiais INMET: https://alertas2.inmet.gov.br/

## Próxima revisão sugerida

1. Testar fluxos ponta a ponta em navegador com conexão ativa e obter dados de estações autorizados em backend com cache + monitoramento de disponibilidade.
2. Salvar previsões imutáveis emitidas no presente e comparar depois contra observações de qualidade controlada, com auditoria periódica em janelas separadas de treino/validação.
3. Calibrar pesos por localidade e horizonte somente se houver ganho estatístico em amostras não usadas no treinamento.
4. Integrar mosaicos de radar licenciados com nowcasting de 0 a 2h, verificando permissões de uso e dados antes da implementação.