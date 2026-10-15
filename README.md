# Painel ASL Acre — Monitoramento PRA-SAF / PSAM-CI

Dashboard do Programa ASL Brasil (SEMA / Governo do Acre) com mapa interativo dos
imóveis e plantios, filtros, indicadores, gráficos e tabela — ligado à planilha de
monitoramento no Google Sheets. Publicado pelo **GitHub + Vercel**.

## O que tem no painel

- **Mapa interativo**: municípios (IBGE 2022), limites dos imóveis e áreas de plantio.
  Clique num município para filtrar; clique num imóvel ou plantio para ver a ficha
  completa (dados do imóvel, áreas plantadas e resultado da última visita).
  Plantios podem ser coloridos por **tipo**, **situação** ou **fase**; mapa base claro ou satélite.
- **Filtros**: município, fase, tipo de plantio, situação, avaliação final e busca livre
  (imóvel, proprietário, núcleo, ramal, código CAR ou número completo do CAR).
- **Indicadores**, **8 gráficos** e **tabela** ordenável com exportação para CSV.

## Publicar (uma vez só)

### 1. GitHub
1. Crie o repositório (ex.: `dashboard_asl`) **sem** README, sem .gitignore e sem licença —
   esses arquivos já vêm no pacote.
2. Na página do repositório vazio, clique em **uploading an existing file**.
3. Descompacte o pacote e arraste **o conteúdo da pasta** (não a pasta em si):
   `index.html`, `vercel.json`, `package.json` e as pastas `api`, `assets`, `data`, `lib`,
   `scripts`, `ferramentas`. Clique em **Commit changes**.

### 2. Vercel
1. Em vercel.com, entre com a conta do GitHub → **Add New… → Project**.
2. Escolha o repositório `dashboard_asl` → **Import**.
3. Não mude nada: *Framework Preset* = **Other**; o build e a pasta publicada já vêm do
   `vercel.json`. Clique em **Deploy**.

### 3. Atualização automática (uma vez)
1. **Deploy Hook**: no projeto, *Settings → Git → Deploy Hooks* → nome `Atualizacao planilha`,
   branch `main` → **Create Hook**. Copie a URL.
2. **Variáveis**: *Settings → Environment Variables*, adicione:
   - `DEPLOY_HOOK_URL` = a URL copiada acima
   - `CRON_SECRET` = uma senha qualquer com 16+ caracteres (impede que outra pessoa dispare a rotina)
3. *Deployments* → menu ⋯ do último deploy → **Redeploy**, para as variáveis valerem.

Pronto. O endereço fica `dashboard-asl.vercel.app` (ou parecido); em *Settings → Domains*
dá para trocar.

## Atualização dos dados

- **Automática, semanal**: toda **segunda-feira às 17h (horário do Acre)** a Vercel chama
  `api/atualizacao-semanal.mjs`, que dispara um novo deploy; o build lê a planilha e publica.
  No plano gratuito (Hobby) a Vercel executa em algum momento **entre 17:00 e 17:59**.
  Para mudar dia/horário, edite `"schedule": "0 22 * * 1"` em `vercel.json`
  (formato cron, em **UTC**: 22h UTC = 17h no Acre).
  Os registros ficam em *Settings → Cron Jobs → View Logs*.
- **Manual**: o botão **Atualizar agora** lê a planilha na hora e atualiza a tela. Se a
  planilha mudou em relação à versão publicada, ele também dispara um novo deploy, para que
  todos os visitantes vejam a versão nova em ~1 minuto. Cliques sem mudança na planilha não
  geram deploy.

### Regras para a planilha continuar funcionando
- Compartilhamento: **“Qualquer pessoa com o link” → Leitor**.
- A aba lida é a do link (`gid=714297731`). Para trocar de planilha ou aba, crie as variáveis
  `SHEET_ID` e `SHEET_GID` na Vercel.
- O cabeçalho fica na **linha 1**. A ordem das colunas pode mudar; os nomes, não
  (acentos e maiúsculas são tolerados). A coluna **CAR** é obrigatória.

## Como os dados se ligam

| Fonte | Arquivo | Observação |
|---|---|---|
| Shape de imóveis | `data/propriedades.geojson` | 1 imóvel por código CAR (repetidos entre fases foram unidos) |
| Shape de áreas executadas | `data/areas.geojson` | fase vem do nome da camada (I 2022/23 … IV 2025/26) |
| Municípios IBGE 2022 | `data/municipios.geojson` | simplificado para web |
| Planilha Google Sheets | `data/monitoramento.json` | gerado a cada deploy |

A planilha se liga aos shapes pelos **4 últimos caracteres da coluna CAR**, que são o campo
`ID_CAR` dos shapes (ex.: `AC-1200401-…F6E2CE` → `E2CE`).

**Privacidade:** CPF (dos shapes) e telefone (da planilha) nunca são publicados.

## Atualizar os shapes (nova fase ou correções)

```bash
python3 ferramentas/atualizar_shapes.py "C:/caminho/da/pasta/com/os/shapes"
```

A pasta deve ter `Propriedades_*.shp` e `AreasExecutadas_*.shp` (com .dbf/.shx/.cpg).
O script regrava a pasta `data/`; envie-a ao GitHub e a Vercel publica sozinha. Para uma
**nova fase** (ex.: Fase V), acrescente-a nas listas `FASES` de `ferramentas/prep_geo.py` e
`assets/app.js` e uma cor `--f5` em `assets/style.css`.

## Estrutura

```
index.html                    página
assets/                       app.js (mapa, filtros, tabela), charts.js, style.css, logos, Leaflet
data/                         GeoJSON + dados da planilha
lib/planilha.mjs              leitura/limpeza da planilha
scripts/build-data.mjs        build: lê a planilha e monta dist/
api/dados.mjs                 atualização manual (/api/dados)
api/atualizacao-semanal.mjs   rotina semanal (Vercel Cron)
vercel.json                   build, cron e cabeçalhos
ferramentas/                  conversão shapefile → GeoJSON
```
