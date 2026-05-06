# Minimumflow LM Studio Only

Date: 2026-05-06

## Goal

`tools/minstevann` must use LM Studio as its only LLM runtime. Ollama must not be a fallback, a selectable provider, a default, or a documented setup path.

After this change, one-station pipeline runs must call LM Studio through the local OpenAI-compatible API and never call `localhost:11434` or `/api/generate`.

## Required Runtime Contract

- Default host: `http://127.0.0.1:1234`
- Default model: `gemma-4-e2b-it`
- API endpoint: `POST /v1/chat/completions`
- Response format: LM Studio-compatible `json_schema`
- Expected loaded model file: `gemma-4-E2B-it-Q4_K_M.gguf`, exposed by LM Studio as model id `gemma-4-e2b-it`

If LM Studio is not reachable, the pipeline fails clearly for that station. It must not retry against Ollama or any other provider.

## Code Changes

### `tools/minstevann/src/models.py`

Replace Ollama-named defaults with LM Studio defaults:

- `DEFAULT_MODEL = "gemma-4-e2b-it"`
- `DEFAULT_LM_STUDIO_HOST`, read from `HG_LM_STUDIO_HOST`, defaulting to `http://127.0.0.1:1234`
- `DEFAULT_LM_STUDIO_TIMEOUT`, read from `HG_LM_STUDIO_TIMEOUT`

Remove provider selection such as `HG_LLM_PROVIDER`. The pipeline has one provider.

### `tools/minstevann/src/llm.py`

Replace the mixed Ollama/OpenAI-compatible implementation with one LM Studio client:

- Rename `OllamaError` to `LLMError` or `LMStudioError`.
- Rename `call_ollama()` to an LM Studio-specific function.
- Delete the Ollama `/api/generate` payload and code path.
- Always build requests for `/v1/chat/completions`.
- Keep the existing prompt and JSON parser behavior.
- Keep LLM cache behavior, keyed by station, model, and snippet.

The request payload must use chat messages and LM Studio-compatible `json_schema`, not Ollama `format: "json"` and not OpenAI `json_object`.

### `tools/minstevann/run.py`

Rename user-facing output and help text:

- Print `LM Studio: <host>`.
- `--model` help says LM Studio model id.
- `--host` help says LM Studio host URL.
- Retry/error text uses `LLMError` or `LMStudioError`, not Ollama.
- Internal helper names mentioning Ollama should be renamed where practical, especially `_run_ollama_on_station`.

### `tools/minstevann/README.md`

Replace Ollama setup with LM Studio setup:

- Start LM Studio.
- Load `gemma-4-E2B-it-Q4_K_M.gguf`.
- Start Local Server on `http://127.0.0.1:1234`.
- Confirm `GET http://127.0.0.1:1234/v1/models` lists `gemma-4-e2b-it`.

Remove `ollama pull`, `ollama serve`, `HG_OLLAMA_HOST`, and other Ollama wording.

## Output Contract Preservation

This change must not alter the public minimum-flow JSON schema. `backend/data/minimumflow.json` remains perioder-only:

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

Each `periode` must remain either `DD.MM - DD.MM`, `hele året`, or `null`.

## Verification

Before continuing one-station pipeline runs:

1. `python -m unittest tests` from `tools/minstevann`.
2. `node backend\api\nveid.test.mjs`.
3. `node --check backend\api\docs.js`.
4. Search `tools/minstevann` for forbidden runtime/docs strings:
   - `Ollama`
   - `ollama`
   - `HG_OLLAMA`
   - `/api/generate`
   - `localhost:11434`
5. Verify LM Studio is reachable:
   - `GET http://127.0.0.1:1234/v1/models`
6. Run exactly one station:
   - `run.py plant 1169 --force`
7. Inspect only `backend/data/minimumflow.json["1169"]` and validate its period format.

## Out Of Scope

- Running a full batch.
- Running all stations.
- Reintroducing Ollama as a compatibility option.
- Changing the perioder JSON schema.
