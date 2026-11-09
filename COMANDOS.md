# Comandos — Teste de Volumetria siteSportsbook

## Forma recomendada: assistente único

```powershell
npm run wizard
```

Pergunta, em sequência: ambiente (PROD/PREPROD) → login (usuário/senha) →
rótulo da sessão → fixtures (IDs ou URLs) → **se quer incluir Aposta Futura/
outrights (s/n — se sim, já pega automaticamente o primeiro torneio/mercado
ativo disponível, sem pedir escolha)** → volume → valor da aposta →
"deseja configurar outra sessão? (s/n)". Ao confirmar o resumo final, roda
todas as sessões configuradas **em paralelo** e já gera o relatório
consolidado ao terminar.

Pra rodar N contas em paralelo, é só responder "sim" quando ele perguntar
se quer configurar outra sessão — quantas vezes quiser.

---

## Comandos manuais (modo legado, uma sessão só)

Referência rápida dos comandos individuais, caso prefira configurar cada
etapa na mão em vez de usar o assistente.

### 1. Login (gerar/renovar o token)

```powershell
npm run login
```

Pede CPF/usuário e senha na hora (não fica salvo em disco), e grava o token
em `.session.json`. Rode de novo sempre que o token expirar (validade
configurada: 12h).

**Para escolher o ambiente do login** (padrão é `preprod` se não informar nada):

```powershell
$env:SITE_SPORTSBOOK_ENV="prod"
npm run login
```

---

## 2. Buscar fixtures reais (partidas que você quer incluir no teste)

```powershell
npm run fetch:fixtures -- colocarAquiGameIds colocarAquiGameIds
```

Aceita tanto o ID da partida quanto a URL inteira de `game-details`:

```powershell
npm run fetch:fixtures -- https://www.sitesportsbook.example/game-details/colocarAquiGameIds colocarAquiGameIds
```

Gera `fixtures.prod.json` (mercados pré-jogo) e `liveFixtures.prod.json`
(mercados ao vivo) automaticamente.

---

## 3. Rodar o teste de volumetria

Todos os parâmetros abaixo podem ser definidos de duas formas:
- **Persistente**: edite o arquivo `.env` (vale para todas as execuções seguintes)
- **Só nessa execução**: defina com `$env:VARIAVEL="valor"` antes do comando (some quando você fechar o terminal)

```powershell
$env:SITE_SPORTSBOOK_ENV="prod"                 # ambiente: "prod" ou "preprod"
$env:SITE_SPORTSBOOK_TOTAL_BETS="20"            # quantas apostas gerar no total
$env:SITE_SPORTSBOOK_BATCH_SIZE="20"            # tamanho de cada lote
$env:SITE_SPORTSBOOK_CONCURRENCY="5"            # requisições simultâneas no máximo
$env:SITE_SPORTSBOOK_BET_AMOUNT="0.5"           # valor fixo de cada aposta (R$)
$env:SITE_SPORTSBOOK_MIN_PER_CATEGORY="2"       # garante N ocorrências mínimas de cada categoria de mercado

npm run test:volumetry
```

Se quiser voltar ao sorteio de valor aleatório (em vez de valor fixo), é só
não definir `SITE_SPORTSBOOK_BET_AMOUNT` (ou apagar a linha do `.env`).

---

## 4. Gerar o relatório

```powershell
npm run report
```

Gera um HTML a partir do `results-*.ndjson` mais recente. Para um arquivo
específico:

```powershell
npm run report -- ./results-1788988609497.ndjson
```

---

## 5. Consultar o settlement (depois do fim das partidas)

```powershell
npm run report:settlement
```

Consulta o resultado final das apostas aceitas e gera
`relatorio-settlement-*.html`. Pode repetir até não haver pendentes. Se o token
tiver expirado, rode `npm run login` antes.

---

## Exemplo completo (rodada de 20 apostas em produção, R$0,50, cobertura garantida)

```powershell
$env:SITE_SPORTSBOOK_ENV="prod"
$env:SITE_SPORTSBOOK_TOTAL_BETS="20"
$env:SITE_SPORTSBOOK_BATCH_SIZE="20"
$env:SITE_SPORTSBOOK_CONCURRENCY="5"
$env:SITE_SPORTSBOOK_BET_AMOUNT="0.5"
$env:SITE_SPORTSBOOK_MIN_PER_CATEGORY="2"

npm run login
npm run fetch:fixtures -- colocarAquiGameIds colocarAquiGameIds colocarAquiGameIds
npm run test:volumetry
npm run report
```

---

## Onde os parâmetros ficam salvos por padrão (.env)

Se você preferir não digitar as variáveis toda vez, edite o `.env` (copiado
uma vez de `.env.example`) e deixe os valores prontos ali — os comandos
`npm run ...` já leem o `.env` automaticamente:

```
SITE_SPORTSBOOK_ENV=prod
SITE_SPORTSBOOK_TOTAL_BETS=20
SITE_SPORTSBOOK_BATCH_SIZE=20
SITE_SPORTSBOOK_CONCURRENCY=5
SITE_SPORTSBOOK_BET_AMOUNT=0.5
SITE_SPORTSBOOK_MIN_PER_CATEGORY=2
```

Um `$env:VARIAVEL="valor"` digitado no terminal antes do comando **sempre
sobrescreve** o que está no `.env` — útil para testar um valor diferente sem
mexer no arquivo.
