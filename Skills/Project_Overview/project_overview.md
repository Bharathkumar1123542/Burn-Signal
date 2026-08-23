# BurnSignal — Project Overview

**Document version:** 1.0
**Status:** Draft for hackathon build (BRICS Sustainability Challenge)
**Owners:** BurnSignal engineering team

---

## 1. Document Purpose

This document defines what BurnSignal is, who it serves, what it must achieve, and what is explicitly out of scope for the current build cycle. It is the reference used to resolve scope disputes during implementation. `architecture.md` defines how the system is structured; `implementation.md` defines how each component is built. This document defines why the system exists and what "done" means.

---

## 2. Problem Statement

### 2.1 Parent challenge (BRICS Sustainability theme)

Major BRICS cities and agricultural regions monitor air quality at a macro (city/national) level but consistently miss hyper-local and cross-border pollution events — industrial emissions, large-scale agricultural burning, and trans-boundary smog. The absence of real-time, granular data prevents coordinated climate action and directly threatens public health.

### 2.2 Specific problem BurnSignal solves

Stubble (crop residue) burning is a leading contributor to seasonal hyper-local air quality collapse in agricultural belts (e.g. Punjab–Haryana–NCR in India). Current interventions are reactive: burns are detected via thermal satellite anomaly (e.g. VIIRS/MODIS fire counts) *after ignition*, when smoke and health impact are already underway. Enforcement- and penalty-based approaches have low compliance because they do not address the farmer's root constraint: burning is the cheapest, fastest way to clear a field before the next sowing window, and formal alternatives (Happy Seeder rental, in-situ decomposition, ex-situ collection) are either unknown to the farmer, unavailable nearby, or perceived as slower/costlier.

There is no existing system that:
1. Predicts burn probability **before** ignition, at **plot-level** granularity.
2. Combines biophysical signal (residue load) with the farmer's actual economic decision pressure (MSP realization, subsidy uptake).
3. Converts that prediction into a **targeted, pre-emptive, human-delivered intervention** (not just a dashboard alert to an official).

### 2.3 Why this matters now

Every day of delay between "field is harvested" and "farmer decides how to clear it" is a window for intervention. Once the decision to burn is made and executed, the pollution event — and the associated health and climate cost — is irreversible for that season. BurnSignal targets that decision window.

---

## 3. Solution Summary

BurnSignal is a predictive agricultural-burning agent that:

1. Scores every registered farm plot in a target district for **burn-likelihood in the next 72 hours**, using satellite-derived post-harvest residue load (Landsat-8 NDVI differencing) combined with district-level socioeconomic pressure signals (MSP realization rate, subsidy/equipment-scheme uptake rate).
2. Clusters high-probability plots geographically and temporally.
3. Maps each cluster to the nearest **Krishi Vigyan Kendra (KVK)** extension worker(s) with jurisdiction.
4. Auto-generates a personalized, vernacular-language voice script (via Gemini TTS) that offers the farmer a concrete alternative — a nearby available stubble-management equipment booking — and dispatches it **before** the estimated burn decision point.

The system is designed as one deployable module of the larger BRICS federated climate action platform (see `brics-sustainability` project context), sharing its interoperability goal: the plot-scoring and alerting pattern here should be portable to other BRICS agricultural-burning contexts (e.g. sugarcane pre-harvest burning in Brazil) with a swapped data source layer.

---

## 4. Target Users & Stakeholders

| Stakeholder | Role in system | What they need from BurnSignal |
|---|---|---|
| Farmer (smallholder/marginal, target plot owner) | End recipient of intervention | A timely, understandable, actionable alternative to burning — not a penalty notice |
| KVK extension worker | Human delivery agent | A short, prioritized daily list of at-risk farmers in their jurisdiction, with a ready-made script and booking link/reference |
| District agriculture officer | Oversight / escalation | A hotspot map and cluster-level summary to plan equipment deployment |
| State Pollution Control Board (downstream consumer) | Policy / enforcement | Aggregated, anonymized burn-probability heatmaps for resource planning |
| Hackathon judges / BRICS platform integrators | Evaluators | Evidence the system is real, interoperable, and demonstrably reduces time-to-intervention |

---

## 5. Goals & Success Metrics

| Goal | Metric | Target for MVP/demo |
|---|---|---|
| Predict burns before ignition | Lead time between alert dispatch and historical burn event (backtested) | ≥ 48 hours median lead time |
| Plot-level precision | Model precision@top-decile on held-out historical burn-event data | ≥ 0.65 precision at top 10% scored plots |
| Actionable outreach, not noise | % of dispatched alerts that map to a real, available equipment slot | 100% (no alert without a valid booking option) |
| Human-deliverable at scale | Time from cluster detection to extension-worker call list generated | < 15 minutes (automated pipeline) |
| Interoperability with BRICS platform | Data contracts (schemas, APIs) reusable without code change for a second crop/region | Documented and validated against ≥ 1 alternate scenario (e.g. sugarcane pre-harvest burning) |

---

## 6. Scope

### 6.1 In scope (MVP / hackathon build)
- Ingestion of Landsat-8 surface reflectance data via Google Earth Engine for a single pilot district.
- NDVI differencing pipeline to derive a per-plot residue-load index.
- Ingestion of district-level MSP realization and subsidy-uptake data (static/batch load from a provided dataset — see Section 7, Assumption A3).
- Vertex AI AutoML regression model producing a 0–1 burn-likelihood score per plot for a rolling 72-hour window.
- Spatial/temporal clustering of high-probability plots (DBSCAN or grid-based clustering).
- Static registry mapping plots → KVK jurisdiction → extension worker contact.
- Gemini TTS-generated vernacular (Hindi/Punjabi) voice script per at-risk farmer, referencing the nearest available equipment slot from a static/mock booking inventory.
- A2A coordination agent that assembles the daily call list and triggers script generation.
- Simple ops dashboard (read-only) showing scored plots, clusters, and dispatch status.

### 6.2 Out of scope (explicitly deferred)
- Live telephony integration (actual outbound calling) — MVP produces the script and a dispatch record; connecting to a telephony provider (e.g. Exotel/Twilio) is a Phase 2 item.
- Real-time equipment booking transaction system — MVP references a static inventory snapshot, not a live reservation system with confirmation/cancellation flows.
- Multi-district / multi-state horizontal scaling — MVP targets one pilot district only.
- Farmer-facing mobile app or self-service UI.
- Automated enforcement or penalty workflows — BurnSignal is outreach-only by design; it never triggers punitive action.
- Cross-BRICS-nation live data sharing — the interoperability goal is satisfied by documented, reusable schemas/APIs, not a live multi-country deployment.

---

## 7. Assumptions & Constraints

| ID | Assumption / Constraint | Impact if false |
|---|---|---|
| A1 | Farm-plot boundaries for the pilot district are available as a GIS layer (shapefile/GeoJSON) with stable plot IDs | Without this, NDVI differencing cannot be attributed to individual plots — falls back to grid-cell-level scoring |
| A2 | Landsat-8 revisit cadence (16 days) is combined with Sentinel-2 (5-day) to meet the 72-hour scoring window | Landsat-8 alone cannot support a 72-hour refresh; architecture must ingest Sentinel-2 as the primary near-real-time source and use Landsat-8 for calibration |
| A3 | District-level MSP and subsidy-uptake data is available as a batch dataset (government open data / provided CSV), not a live feed | Socioeconomic feature will be updated on a slower cadence (e.g. weekly) than the biophysical feature |
| A4 | KVK extension worker contact registry and jurisdiction boundaries are obtainable for the pilot district | Without this, the A2A coordination step cannot route alerts to a real human; a mock registry is substituted for demo purposes |
| A5 | Google Cloud project with Vertex AI, BigQuery, Earth Engine, and Gemini API access is provisioned before Phase 1 begins | Blocks all downstream implementation |
| A6 | Voice scripts are advisory only; no legal/compliance review of outbound-calling regulations (e.g. TRAI DND rules in India) is in scope for the hackathon build | Production deployment requires legal review before real telephony dispatch |

---

## 8. Key Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| NDVI-based residue index has false positives from non-burn-related vegetation change (e.g. irrigation, other crop cycles) | Medium | High (erodes farmer trust in alerts) | Cross-validate against historical VIIRS/MODIS fire-count ground truth during model training; report precision@top-decile explicitly |
| KVK extension worker registry is incomplete or outdated | Medium | Medium (alerts have no delivery path) | Build a fallback: cluster-level alert to district agriculture officer when no worker is mapped |
| Socioeconomic data is stale (annual/seasonal, not real-time) | High | Low–Medium | Treat MSP/subsidy features as slow-moving priors, not the primary predictive signal; document this limitation explicitly |
| Gemini TTS vernacular output is linguistically inaccurate for local dialect | Medium | Medium | Human-in-the-loop review of a sample of generated scripts before demo; flag as a production hardening item |

---

## 9. Milestones

| Phase | Deliverable | Depends on |
|---|---|---|
| Phase 0 — Data foundation | Plot boundary layer, Earth Engine access, MSP/subsidy dataset loaded into BigQuery | A1, A3, A5 |
| Phase 1 — Scoring pipeline | NDVI differencing pipeline + Vertex AI AutoML model producing plot-level burn-likelihood scores | Phase 0 |
| Phase 2 — Clustering & routing | Hotspot clustering + KVK registry mapping | Phase 1, A4 |
| Phase 3 — Outreach generation | Gemini TTS script generation + dispatch record + ops dashboard | Phase 2 |
| Phase 4 — Demo hardening | Backtest against historical burn events, precision/lead-time metrics, judge-facing narrative | Phase 3 |

---

## 10. Glossary

| Term | Definition |
|---|---|
| NDVI | Normalized Difference Vegetation Index — satellite-derived vegetation health/density index |
| NDVI differencing | Comparing pre- and post-harvest NDVI to infer residue (stubble) load left on a plot |
| MSP | Minimum Support Price — government-guaranteed crop purchase price, a key driver of farmer economic pressure |
| KVK | Krishi Vigyan Kendra — India's district-level agricultural extension and training center network |
| A2A | Agent-to-agent coordination — the orchestration layer routing scored/clustered plots to a delivery mechanism |
| Burn-likelihood score | Model output (0–1) representing predicted probability a given plot will be burned within the next 72 hours |
