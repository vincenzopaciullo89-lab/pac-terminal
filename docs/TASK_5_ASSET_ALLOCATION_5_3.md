# Task 5 (O1) — Analisi di asset allocation, CHECKPOINT 5.3

> **Stato**: dimensioni qualitative consegnate. **Nessuno scoring applicato.**
> `config.js` intatto.
>
> **Tag delle fonti**:
> `[FATTO]` numero ufficiale (TER iShares/Vanguard KIID, bollo italiano).
> `[STIMA]` derivato da factsheet pubblici ~Q1 2025 (i pesi spostano nel tempo, niente decimali).
> `[ASSUNZIONE]` scelta esplicita del calcolo (capitale, finestra, ribilanciamento).
> `[GIUDIZIO]` valutazione professionale, non un numero.

## Framing

C3 (70/30 VWCE/CSNDX) è il candidato col CAGR storico più alto tra i non-legacy. La domanda guida non è "trova una ragione per non prenderlo", ma:
**quanto dell'extra-rendimento di C3 è reale/ripetibile e cosa si paga per averlo?**

Se C3 regge, lo dico. Se l'extra è artefatto del periodo, lo dico.

---

## 1. Costo totale

### TER ponderato + bollo + cost wedge 20y

Assunzioni: capitale esempio €100K, orizzonte 20 anni, drag annuale = TER ponderato + bollo titoli 0,2%. Per C1-C5 uso il TER **operativo**: il PAC reale è su **VWCE 0,19%** (non SWDA 0,20%, usato come proxy storico). C6 (legacy) mantiene SWDA.

| candidato | TER pond | drag/anno | wedge 20y su €100K | Δ vs più economico |
|---|---|---|---|---|
| C1 VWCE 100% | 0,190% | 0,390% | €7.518 | +€101 |
| **C2 90/10 (status quo)** | 0,201% | 0,401% | €7.722 | +€305 |
| **C3 70/30** | **0,223%** | **0,423%** | **€8.129** | **+€712** |
| C4 80/20 VWCE/EM | 0,188% | 0,388% | €7.481 | +€64 |
| C5 70/15/15 | 0,205% | 0,405% | €7.796 | +€379 |
| C6 legacy ex-VETA | 0,185% | 0,385% | €7.416 | 0 (più economico) |

**[FATTO]** TER ufficiali (KIID iShares/Vanguard): VWCE 0,19% · CSNDX 0,30% · IEMA 0,18% · CSPX 0,07% · SWDA 0,20%.

**Tax drag**: in regime amministrato italiano con ETF UCITS *accumulating* (VWCE/CSNDX/IEMA/CSPX/SWDA tutti accumulating), **non c'è tassazione annua sui rendimenti**: il 26% si applica alla vendita (capital gain) o sui dividendi distribuiti — irrilevante qui perché accumulating. Il bollo 0,2% è il solo drag fiscale ricorrente. → **non aggiungo "tax drag" oltre al bollo**, l'avrei contato due volte.

**[GIUDIZIO]** Su €100K e 20 anni, il delta costi tra C1 e C3 (~€700) è **piccolo in valore assoluto** rispetto al CAGR differenziale storico (12,1% vs 14,6%) e **non è il driver decisivo**. Diventerebbe rilevante su capitali molto maggiori (€500K → ~€3.500 di delta).

---

## 2. Overlap reale delle holding

**[STIMA — factsheet iShares/Vanguard pubblici, Q1 2025]**. Numeri arrotondati.

### Composizione degli indici sottostanti

| Indice | USA | Tech (settore) | Top-10 holding | Note |
|---|---|---|---|---|
| **VWCE** (FTSE All-World) | ~65% | ~24% | ~22% | include ~10% emergenti |
| **CSNDX** (Nasdaq 100) | ~100% | ~59% | ~50% | i 7 nomi top sono i Mag 7 |
| **CSPX** (S&P 500) | 100% | ~32% | ~34% | overlap quasi totale coi top di VWCE/SWDA US |
| **SWDA** (MSCI World DM) | ~72% | ~26% | ~24% | no emergenti |
| **IEMA** (MSCI EM IMI) | 0% | ~22% (Taiwan/Korea semis) | ~20% | top: TSMC, Tencent, Samsung |

### Quanto C2/C3 davvero spostano vs C1

**Punto chiave**: CSNDX è **quasi un sottoinsieme** di VWCE. ~96-98% dei nomi del Nasdaq 100 sono dentro FTSE All-World (con pesi minori). Aggiungere CSNDX **non aggiunge titoli**, **rimette enfasi** sui Mag 7 e sui big tech US che VWCE già contiene.

| candidato | USA aggregato | Tech aggregato | Δ vs C1 (USA) | Δ vs C1 (tech) |
|---|---|---|---|---|
| C1 | 65,0% | 24,0% | — | — |
| **C2 90/10** | **68,5%** | **27,5%** | **+3,5%** | **+3,5%** |
| **C3 70/30** | **75,5%** | **34,5%** | **+10,5%** | **+10,5%** |
| C4 80/20 EM | 52,0% | 23,6% | −13,0% | −0,4% |
| C5 70/15/15 | 60,5% | 28,9% | −4,5% | +4,9% |
| C6 legacy ex-VETA | 88,4% | 36,6% | +23,4% | +12,6% |

**[GIUDIZIO]** Tre cose:
- **C2 status quo aggiunge davvero poco**: 3,5% di tilt extra USA-tech su nomi già al top di VWCE. È un boost di concentrazione, non diversificazione.
- **C3 raddoppia il tilt**: 75,5% USA e 34,5% tech — quote alte ma **non assurde** nel contesto di un investitore già "global market cap" (anche VWCE è 65% USA per costruzione del market cap globale; molti consiglieri lo trovano già troppo, ma è semplicemente il mercato).
- **C4 è l'unica vera diversificazione strutturale** (−13% USA, +20% EM). C5 è un ibrido che non sposta molto.
- **C6 è il portafoglio più concentrato** (88% USA, 37% tech): SWDA+CSPX significa contare il 500 US due volte.

---

## 3. Concentrazione USA/tech aggregata

Già nella tabella sopra. Ricapitolo l'ordine di concentrazione:

```
C4 (52% USA)  <  C5 (60%)  <  C1 (65%)  <  C2 (69%)  <  C3 (76%)  <  C6 (88%)
C4 (24% tech) <  C1 (24%)  <  C2 (28%)  <  C5 (29%)  <  C3 (35%)  <  C6 (37%)
```

**[GIUDIZIO]** C3 (75,5% USA) si avvicina pericolosamente al regime di **single-country bet su Stati Uniti**. Per riferimento storico: nel 1989 il Giappone era il 45% del MSCI World; chi era "global market cap" era 45% Giappone. Il decennio dopo. Questo non dice "il 75% USA crollerà come il Giappone", dice: **la concentrazione geografica oggi è alta per gli standard storici, e C3 la amplifica ulteriormente**.

---

## 4. Forward-looking expected return — con caveat pesante

### I CAGR storici come punto di partenza

| candidato | CAGR 2010-2026 (EUR) |
|---|---|
| C1 | 12,1% |
| C2 | 12,9% |
| C3 | 14,6% |
| C4 | 11,1% |
| C5 | 12,6% |
| C6 | 15,0% |

**[CAVEAT - importante]**: questi numeri **non sono il rendimento atteso futuro**. Sono il rendimento *realizzato* in 16 anni eccezionalmente favorevoli all'equity:
- Recovery post-GFC dal minimo 2009.
- Tassi reali negativi per ~10 anni → multipli azionari in espansione strutturale.
- Dominanza tech-USA senza precedenti (Mag 7 nel 2010 valevano ~9% di MSCI World; oggi ~22%).

### Forward-looking serio (consensus istituzionale 2024-2025)

**[STIMA — consensus rapporti GMO, AQR, BlackRock, Vanguard CMA, Q4 2024-Q1 2025]**:
- Equity globale (sviluppati): **3-5% reale** atteso a 10 anni.
- US large cap: **1-4% reale** (alcune fonti: prossimo a 0 o negativo per US growth, dato valutazioni elevate CAPE Shiller >35).
- US small/value: 4-6% reale.
- Emergenti: **5-8% reale** (valutazioni più basse, P/E ~13x vs S&P 21x).
- Nasdaq 100 specifico: nessuna fonte serie dà un forecast separato; **assunzione mia [GIUDIZIO]: una premio rispetto all'equity USA broad non è garantito**, può essere zero o negativo se i multipli si comprimono.

**In termini nominali EUR** (aggiungendo ~2% inflazione attesa):
- C1 (VWCE 100%): ~5-7% nominale [STIMA debole, range largo]
- C3 (70/30): plausibilmente **simile a C1 o peggio**, perché l'extra-rendimento storico di CSNDX deriva da espansione multipli, non da fondamentali. **[GIUDIZIO]**
- C4 (80/20 EM): potenzialmente **simile o leggermente superiore** a C1 a 10y, se EM realizzano il premio valutativo. **[GIUDIZIO]**

### Onestà sull'EM

Caveat aggiuntivo su C4/C5: **gli EM hanno PIL in crescita ma rendimenti azionari storicamente deludenti** rispetto agli sviluppati nei lunghi orizzonti (MSCI EM total return USD 2010-2026 ~3-4%/yr vs S&P ~14%). Il caso bullish per EM oggi si fonda su valutazioni basse, non su una tesi di crescita "EM batte DM perché crescono di più" che storicamente non si è materializzata. **[GIUDIZIO]** L'inclusione di EM non è "comprare crescita", è **comprare valutazione bassa sperando in mean reversion**.

### Sintesi onesta

**[GIUDIZIO]** Non produco un singolo numero forward per ogni candidato — sarebbe fingere precisione che non esiste. La cosa **robusta** che si può dire:
- Il differenziale CAGR storico C3 vs C1 (+2,5% l'anno) **non è ragionevole proiettarlo forward**. Il consensus dice che la dispersione attesa sarà **molto più stretta** o addirittura invertita.
- L'unica cosa di cui si può essere ragionevolmente certi: **gli investitori che si aspettano 12-15% nominale ripetuti nel prossimo decennio sono quasi certamente delusi**.

---

## 5. Behavioral fit

### Numero asset da gestire, ribilanciamento, complessità

| candidato | # asset | Ribilanciamento | Complessità operativa |
|---|---|---|---|
| C1 | 1 | mai necessario | minima |
| C2 | 2 | annuale | bassa |
| C3 | 2 | annuale, importante (i pesi derivano molto) | bassa-media |
| C4 | 2 | annuale | bassa |
| C5 | 3 | annuale, più complesso | media |
| C6 | 4 | impraticabile su legacy congelato | n/a (è "dove sei", non "dove vai") |

**[GIUDIZIO]** Su PAC piccolo (€500/mese), un 3° ETF (C5) significa frazioni più piccole, più commissioni potenziali, più cose da rivedere. Il marginal benefit della terza componente è basso. **C1 e C2 sono i più gestibili**; C5 richiede disciplina che la maggior parte degli investitori retail non ha.

### Profondità del drawdown nella crisi SBAGLIATA — il punto critico

I maxDD quasi identici nella tabella di FASE 5.2 (-31,9% ÷ -33,6%) sono **un artefatto del COVID 2020**, non una proprietà strutturale:
- Il COVID è stato un crollo **breve e simmetrico**: tutto è crollato, tutto è rimbalzato. Il tech ha fatto perfino meglio (lockdown → cloud/digital boom).
- In un **bear classico** (compressione multipli, recessione), il tech ha sempre fatto **peggio** del mercato.

La **doppia lente per evento** mostra questo:

| evento | C1 (100% VWCE) | C2 (90/10) | C3 (70/30) | C4 (80/20 EM) | C5 (70/15/15) | C6 legacy |
|---|---|---|---|---|---|---|
| COVID 2020 | -33,6% | -33,0% | -31,9% | -33,1% | -32,4% | -32,1% |
| **Bear 2022** | -16,8% | -17,7% | **-19,5%** | **-15,9%** | -17,4% | -19,2% |
| EM/China 2021-22 | -16,8% | -17,7% | -19,9% | -15,9% | -17,7% | -19,5% |

Nel **2022 (bear di compressione multipli)**, C3 perse il 15% in più di C4. Su un bear stile **dot-com 2000-2002** (durato 31 mesi, Nasdaq 100 -83% in USD, MSCI World -49%), l'ordine sarebbe ancora più estremo. Approssimazione [STIMA molto larga]: C3 farebbe probabilmente **−55÷-65%** vs ~-45% di C1 in EUR.

**[GIUDIZIO]** Il rischio reale di C3 non si vede nei numeri storici 2010-2026 perché in quel periodo *non c'è stato* un bear tech profondo. Chi sceglie C3 sulla base del CAGR storico sta facendo **inferenza fuori campione**.

### Probabilità di abbandono in drawdown (staying power)

**[GIUDIZIO]** Il rischio comportamentale più alto è abbandonare la strategia nel momento peggiore. La regola empirica: gli investitori abbandonano quando il dolore supera la propria *narrativa* sull'asset.

| candidato | rischio abbandono | perché |
|---|---|---|
| C1 | basso | "mercato mondiale" è una narrativa robusta e facile da difendere |
| C2 | basso | quasi C1, narrativa identica |
| **C3** | **alto** | un -55% del Nasdaq + media negativa sulla "fine del tech" può far cedere |
| C4 | medio | "perché tengo EM se l'America vince?" è una pressione narrativa costante |
| C5 | medio | 3 asset, ognuno con la sua tesi → più punti di attrito psicologico |
| C6 | n/a | legacy congelato, non più alimentato |

**Allineamento col sistema tattico (TASK D)**: il PAC tattico funziona se l'investitore versa di più durante i crash. Su un'allocazione che psicologicamente non sostieni, **boostare a -20% diventa impossibile**: già fai fatica a non vendere, figuriamoci ad aumentare. Questo è un effetto di **secondo ordine ma reale** che penalizza i candidati a alto rischio di abbandono.

---

## Sintesi pre-scoring (riepilogo onesto)

Quanto dell'extra-rendimento di C3 vs C1 (+2,5% CAGR) è reale/ripetibile? **[GIUDIZIO]**:
- **Parte è espansione multipli su Nasdaq** in un decennio dove i multipli sono passati da P/E ~20 a >35. Non ripetibile (può solo contrarsi).
- **Parte è dominanza Mag 7** che si esprime già anche dentro VWCE: il tilt CSNDX è amplificazione di un già-presente, non scoperta di un asset non correlato.
- **Costo cumulato in più**: +€712/20y su €100K — piccolo in assoluto.
- **Costo in concentrazione**: USA da 65% a 76% e tech da 24% a 35% — significativo.
- **Costo in drawdown della crisi sbagliata**: stimato +20÷-30% in più in un bear tech profondo. Non visto nei dati storici per assenza di campione.
- **Costo comportamentale**: rischio abbandono materialmente più alto.

Riassumendo: **C3 ha vinto la finestra 2010-2026 per ragioni che probabilmente non si ripeteranno**, e si paga in concentrazione e rischio behavioral. **C2 lo status quo aggiunge molto poco a C1** in tutte le dimensioni. **C4 è l'unico che offre diversificazione strutturale vera**, al prezzo di scommettere su mean reversion EM. **C6 è il più concentrato** e non è un candidato target (è il legacy).

🛑 **CHECKPOINT 5.3** — nessuno scoring applicato, nessun ranking, `config.js` intatto. Aspetto OK per applicare i pesi LOCKED (Costo 20%, Robustezza 25%, Diversificazione 20%, Rendimento atteso 20%, Behavioral 15%) e produrre il ranking + sensitivity (FASE 5.4).
