# Minimumflow Perioder Redesign

Date: 2026-05-06

## Purpose

The `tools/minstevann` pipeline uses `perioder` as the public minimum-flow model from assembly through output. Pipeline code, API tests, and generated data support only the period-based station shape.

The target output for every station in `backend/data/minimumflow.json` is:

```json
{
  "navn": "Kraftverknavn",
  "funnet": true,
  "inntak": [
    {
      "inntakFunksjon": "Hovedinntak",
      "perioder": [
        {"ls": 100, "periode": "01.05 - 30.09", "note": null}
      ]
    }
  ]
}
```

The required not-found or failure entry is:

```json
{
  "navn": "Kraftverknavn",
  "funnet": false,
  "inntak": [
    {
      "inntakFunksjon": null,
      "perioder": [
        {"ls": null, "periode": null, "note": null}
      ]
    }
  ]
}
```

## Scope

In scope:

- Redesign `tools/minstevann/src/assembly.py` so assembled intake results contain `perioder` directly.
- Redesign `tools/minstevann/src/minimumflow_db.py` so it validates and writes only the period-based public shape.
- Update `tools/minstevann/tests.py` to assert the new schema throughout assembly, formatting, plant, and batch behavior.
- Update `backend/api/nveid.js` so public NVEID responses assume period-based source data.
- Update `backend/api/nveid.test.mjs` and `backend/api/docs.js` examples/schemas to use only `perioder`.
- Convert or regenerate `backend/data/minimumflow.json` into the new shape before it is treated as deployable output.

Out of scope:

- No LLM prompt retuning unless tests prove the prompt explicitly requires seasonal fields.
- No support for alternate `minimumflow.json` schemas.
- No compatibility adapter from seasonal fields at API runtime.
- No unrelated Cloudflare, frontend, or RAG/corpus changes.

## Data Model

Each station entry contains:

- `navn`: real NVE station name.
- `funnet`: `true` when at least one reliable minimum-flow requirement is found.
- `inntak`: non-empty array of intake entries.

Each intake entry contains:

- `inntakFunksjon`: string or `null`.
- `perioder`: non-empty array.

Each period contains exactly:

- `ls`: number in liters per second, or `null`.
- `periode`: normalized `DD.MM - DD.MM`, `hele året`, or `null`.
- `note`: normally `null`; reserved for closed edge cases such as natural-flow requirements.

The pipeline emits no seasonal fields such as `sommer_ls`, `sommer_periode`, `sommer_delperioder`, `vinter_ls`, `vinter_periode`, `vinter_delperioder`, or `andre_krav` in `minimumflow.json`.

## Pipeline Design

The pipeline remains NVEID-first:

```text
nveID
-> resolve station metadata
-> resolve concession/PDF source
-> extract usable document text
-> run LLM claim extraction
-> assemble claims into period-based intake entries
-> validate station entry
-> write backend/data/minimumflow.json[nveID]
```

`assembly.py` is the main redesign point. The current seasonal bucket logic should be replaced by period assembly:

- Resolve claim names to one or more intake names as today.
- Convert flow units to liters per second as today.
- Normalize each claim period to the public period string.
- Append valid periods directly to the matching intake.
- Preserve multiple distinct periods as separate entries instead of summarizing them into summer/vinter fields.
- Use the complete fallback period entry when no reliable claim exists.

`minimumflow_db.py` becomes a small public-schema boundary:

- Build fallback entries.
- Validate required station/intake/period fields.
- Normalize period text.
- Write JSON with stable ordering and compact period objects where practical.

## API Design

`backend/api/nveid.js` treats `entry.inntak[].perioder` as the only supported source format for public minimum-flow data. It still guards against malformed data with null-safe defaults, but it does not translate seasonal fields.

The public `/api/NVEID/{NVEID}` response remains period-based. Internal `/api/nveid/{nveID}` and `/api/nveid/{nveID}/minimum-flow` should also expose period-based intake data because the stored source is period-based.

## Testing

Python tests must cover:

- Fallback/not-found output exactly matches the period schema.
- A one-period claim writes one `perioder` entry.
- Multi-period claims remain multiple period entries under the correct intake.
- Multi-intake claims still split and map to distinct intake entries.
- Plant and batch commands write period-based entries to `backend/data/minimumflow.json`.
- No pipeline formatter test expects seasonal fields.

Backend tests must cover:

- API fixtures use period-based entries.
- `/api/NVEID/{NVEID}` returns the stored periods.
- Seasonal-field translation is not part of the tested contract.

Verification commands:

```powershell
python -m unittest tests
node backend\api\nveid.test.mjs
node --check backend\api\docs.js
```

## Migration

`backend/data/minimumflow.json` is deployable only when all entries use the period-based schema. The data refresh is a one-way schema cutover, not a compatibility layer.

A one-time data refresh script may be used to produce period-based entries, but production runtime code must keep only the period-based contract.
