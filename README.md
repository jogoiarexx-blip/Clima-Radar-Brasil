# ClimaRadar Brasil — v0.3 Profissional

Versão reformulada do site com foco em:

- layout mais profissional e editorial;
- remoção de emojis e substituição por ícones/arte próprios em SVG;
- comparação entre múltiplos modelos antes de exibir o resultado principal;
- consenso operacional com leitura de divergência e confiança;
- auditoria com CSV do INMET e aplicação opcional de calibração local;
- estrutura estática compatível com GitHub Pages.

## Estrutura

- `index.html` — página principal
- `styles.css` — layout e identidade visual
- `app.js` — busca, carregamento, comparação dos modelos e renderização
- `audit-core.js` — parser e métricas da auditoria
- `audit-ui.js` — interface da auditoria, exportação e calibração
- `assets/` — ícones e ilustrações SVG originais do projeto

## Destaques da lógica

1. Consulta os modelos Best Match, ECMWF, GFS e ICON.
2. Calcula um consenso ponderado.
3. Penaliza modelos muito fora da mediana do grupo.
4. Mede a divergência térmica e de chuva para gerar um índice de confiança.
5. Permite calibrar pesos com base em auditoria local via CSV do INMET.

## Publicação

Publique todos os arquivos na branch usada pelo GitHub Pages preservando a pasta `assets/`.