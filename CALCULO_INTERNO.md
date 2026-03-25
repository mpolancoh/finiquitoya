# TuLiquidacion: Guia Interna de Calculos por Pais

Documento de referencia interno. No se muestra al usuario.
Ultima actualizacion: marzo 2026

---

## MEXICO -- Ley Federal del Trabajo (LFT) 2024

**Referencia:** LFT vigente, Reforma vacacional 2022 (vigente desde 2023)

### Constantes
- Salario minimo diario general 2024: **$248.93 MXN/dia**
- Tope prima de antiguedad: **2x salario minimo = $497.86 MXN/dia**
- Aguinaldo minimo: **15 dias**
- Vacaciones minimas: **12-14-16-18-20-22-24-26-28-30-32 dias** segun tabla de la reforma

### Conceptos calculados

| Concepto | Base salarial | Formula |
|---|---|---|
| Indemnizacion constitucional | Salario diario **integrado** (SDI) | 90 dias x SDI |
| 20 dias por ano | SDI | 20 x SDI x totalYears |
| Prima de antiguedad | SDI con tope (min(SDI, 2xSMG)) | 12 x SDI_cap x totalYears |
| Vacaciones proporcionales | Salario diario **base** (SDB) | vacDays(anos_completos) x fracAno x SDB |
| Prima vacacional | SDB | 25% del valor de vacaciones totales |
| Aguinaldo proporcional | SDB | 15 x SDB x fracAnoCalendario |

### Salario integrado (Art. 84 LFT)
SDI = (salario_base + componentes_regulares) / 30

Componentes que integran: vales de despensa, transporte, comisiones, bono de puntualidad, fondo de ahorro, otros pagos regulares. NO integran: gastos de representacion, herramientas de trabajo, PMR discrecionales.

### Tabla de vacaciones (Reforma 2022, Art. 76)
```
Ano 1:  12 dias
Ano 2:  14 dias
Ano 3:  16 dias
Ano 4:  18 dias
Anos 5-9:   20 dias
Anos 10-14: 22 dias
Anos 15-19: 24 dias
Anos 20-24: 26 dias
Anos 25-29: 28 dias
Anos 30-34: 30 dias
Anos 35+:   32 dias
```

### Elegibilidad por tipo de terminacion

| Concepto | Despido injust. | Renuncia | Mutuo acuerdo | Despido just. |
|---|---|---|---|---|
| Indemnizacion 3 meses | SI | NO | SI | NO |
| 20 dias/ano | SI | NO | SI | NO |
| Prima antiguedad | SI | Solo si >15 anos | SI | NO |
| Vacaciones | SI | SI | SI | SI |
| Prima vacacional | SI | SI | SI | SI |
| Aguinaldo | SI (si no pagado) | SI | SI | SI |

---

## COLOMBIA -- Codigo Sustantivo del Trabajo (CST)

**Referencia:** CST, Ley 50/1990, Ley 52/1975

### Constantes
- SMMLV 2024: **$1,300,000 COP/mes**
- Auxilio de transporte 2024: **$162,000 COP/mes** (solo para salarios <= 2 SMMLV)
- 10 SMMLV 2024: **$13,000,000 COP/mes** (umbral para indemnizacion)

### Conceptos calculados

| Concepto | Base salarial | Formula |
|---|---|---|
| Cesantias | Salario + transporte (si aplica) | salario_ces x totalDays / 360 |
| Intereses sobre cesantias | Sobre las cesantias | cesantias x 12% x (totalDays/360) |
| Prima de servicios | Salario base | salary x totalDays / 360 |
| Vacaciones | Salario base | 15 dias/ano x totalYears x SDB |
| Indemnizacion | Salario base | Ver tabla abajo |

### Auxilio de transporte en cesantias
Si salario <= 2 SMMLV ($2,600,000 COP): el auxilio de transporte ($162,000) SE INCLUYE en la base de cesantias pero NO en vacaciones ni en indemnizacion.

### Indemnizacion por despido sin justa causa (Art. 64 CST, contrato indefinido)

**Salario <= 10 SMMLV ($13,000,000 COP):**
- Primer ano: 30 dias de salario
- Anos adicionales: + 20 dias por cada ano adicional (o proporcion)

**Salario > 10 SMMLV:**
- Primer ano: 20 dias de salario
- Anos adicionales: + 15 dias por cada ano adicional (o proporcion)

**Formula implementada:**
```
if totalYears <= 1:
  indem = factor_yr1 * totalYears * SDB
else:
  indem = (factor_yr1 + factor_adicional * (totalYears - 1)) * SDB
```

### Elegibilidad por tipo de terminacion

| Concepto | Despido sin causa | Renuncia | Mutuo acuerdo | Despido con causa |
|---|---|---|---|---|
| Cesantias | SI | SI | SI | SI |
| Intereses cesantias | SI | SI | SI | SI |
| Prima de servicios | SI (si no pagada) | SI | SI | SI |
| Vacaciones | SI | SI | SI | SI |
| Indemnizacion | SI | NO | SI | NO |

---

## VENEZUELA -- Ley Organica del Trabajo (LOTTT) 2012

**Referencia:** LOTTT 2012, Arts. 122, 131, 142, 190, 192

### Moneda
Se calcula en USD dado el contexto economico. El usuario ingresa su salario en la moneda que recibe (tipicamente USD).

### Salario integral (Art. 122 LOTTT)
El salario integral incluye alicuotas:
```
SDI = SDB + alicuota_utilidades + alicuota_bono_vacacional

alicuota_util     = (30 dias / 360) x SDB  -->  SDB / 12
alicuota_bono_vac = (bonVacDias / 360) x SDB
bonVacDias        = 7 + max(anosCompletos - 1, 0)  (Art. 192)
```

### Conceptos calculados

| Concepto | Base salarial | Formula |
|---|---|---|
| Prestaciones sociales | SDI | max(MetodoA, MetodoB) |
| Utilidades | SDB | 30 dias x SDB x fracAnoCalendario |
| Vacaciones | SDB | vacDias x fracAno x SDB |
| Bono vacacional | SDB | bonVacDias x fracAno x SDB |
| Indemnizacion | SDI | 30 dias x totalYears x SDI |

### Prestaciones sociales: metodo dual (Art. 142)

**Metodo A (retroactivo):**
```
prestaciones = 30 x totalYears x SDI
```

**Metodo B (trimestral acumulado):**
```
por cada ano Y completo: suma += (60 + 2*(Y-1)) dias x SDI
ano parcial actual: += (60 + 2*max(anosCompletos-1,0)) x fracAno x SDI
```
Donde "60 dias" = 4 trimestres x 15 dias, y +2 dias es el adicional por antiguedad.

**Se usa el mayor de los dos.**

### Vacaciones (Art. 190)
```
Ano 1: 15 dias
Ano 2: 16 dias
Ano 3: 17 dias
...
Ano N: 15 + (N-1) dias
```

### Bono vacacional (Art. 192)
```
Ano 1: 7 dias
Ano 2: 8 dias
...
Ano N: 7 + (N-1) dias
```

### Elegibilidad por tipo de terminacion

| Concepto | Despido injust. | Retiro voluntario | Mutuo acuerdo | Despido just. |
|---|---|---|---|---|
| Prestaciones sociales | SI | SI | SI | SI |
| Utilidades | SI (si no pagadas) | SI | SI | SI |
| Vacaciones | SI | SI | SI | SI |
| Bono vacacional | SI | SI | SI | SI |
| Indemnizacion | SI (Art. 92) | NO | SI | NO |

---

## IMPLEMENTACION EN EL CODIGO

- Archivo: `finiquitoya.html`
- Funciones: `calculateMexico()`, `calculateColombia()`, `calculateVenezuela()`
- Enrutado en: `calculate()` segun `S.country`
- Config por pais: objeto `COUNTRY_CONFIG` (incluye etiquetas, moneda, tipos de terminacion, precios)
- Demo mode: `?demo=1` en la URL desactiva el paywall
- Abogados: funcion `renderLawyerTiers()`, datos de abogados en `COUNTRY_CONFIG.tierThresholds`
  - Tier 1 (basico): total < umbral1
  - Tier 2 (especialista): umbral1 <= total < umbral2
  - Tier 3 (senior): total >= umbral2

---

## ACTUALIZAR MINIMOS CADA ANO

Actualizar estos valores al inicio de cada ano en `finiquitoya.html`:

```javascript
const MIN_WAGE_MX = 248.93;    // MXN diario -- actualizar en enero
const SMMLV_CO    = 1300000;   // COP mensual -- actualizar en enero
const TRANSPORT_CO = 162000;   // COP mensual -- actualizar en enero
```

Venezuela: no hay minimo relevante dado el contexto; se usa salario declarado por el usuario.
