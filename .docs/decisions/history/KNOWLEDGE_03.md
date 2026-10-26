Execution plan: opencode_mosp

A detailed implementation specification for coding agents, using Bun, TypeScript, OpenCode's plugin API, authenticated model pricing where available, external benchmark data, and a collapsible model overview panel.

Project specification

Plugin

opencode_mosp

Owner

GRASTROY Creations

Version

0.1.0

License

MIT

Runtime / package manager

Bun

Language

TypeScript

Configuration

direnv / .envrc

Version control

Git, with commits and pushes performed by you

1. Product objective

Build an OpenCode plugin that presents a side panel containing a sortable, searchable table of models available to the current OpenCode installation.

The plugin should combine three categories of information:

Model availability and pricing: OpenCode's model/provider interfaces and authenticated pricing sources, where available.

Benchmark rankings: GPQA as the primary ranking, with LiveCodeBench as an alternative ranking.

Model metadata: model name, provider, release date, context limits, pricing units, benchmark score, source and last-update information.

The interface should let users collapse and expand the panel with a mouse click and provide a corresponding menu or command action.

Critical architectural decision

OpenCode plugins run in an extension environment; they should not be assumed to have arbitrary access to OpenCode's internal UI components. The plugin API may expose event hooks, commands, tools, or other extension points without exposing a supported way to inject a persistent custom sidebar.

Therefore, the first implementation task is to verify whether the documented plugin API supports a native side panel in the target OpenCode version.

If it does not, the implementation must use a supported alternative, such as an interactive TUI command, a custom tool, or a separately hosted local dashboard. A browser-based dashboard is a fallback, not an equivalent native sidebar.

Do not build the core architecture around undocumented UI internals.

2. Technical constraints and decisions

The coding agent must resolve these points before implementing the UI or integrating external services.

Concern

	

Required decision




OpenCode plugin runtime

	

Use the documented TypeScript plugin interface.




Native side panel

	

Verify supported UI extension points in the installed OpenCode version.




Model discovery

	

Use OpenCode's SDK/API and configured provider data.




OpenCode pricing

	

Reuse the scorecard's approach as a reference, but verify the actual data endpoint and schema.




GPQA

	

Use a specific, documented leaderboard dataset and benchmark variant.




LiveCodeBench

	

Implement as an independent ranking adapter with provenance and freshness metadata.




Model matching

	

Match by provider/model ID and aliases, not display name alone.




Authentication

	

Use existing OpenCode credentials or explicitly configured environment variables; never extract secrets from undocumented internal storage.




TypeScript

	

Verify the current stable compiler and compatibility with the targeted OpenCode SDK before pinning dependencies.




Persistence

	

Store UI preferences separately from model and benchmark data.




Network failures

	

Preserve cached results and expose missing or stale data without crashing the plugin.

2.1 Official documentation and reference implementations

Use these sources as the authoritative starting points:

OpenCode plugin creation and hooks: OpenCode plugin documentation
. The documented plugin system exports functions that return event hooks, and local TypeScript plugins are supported. 
OpenCode
+1

OpenCode SDK: OpenCode SDK documentation
. Verify the current API for listing providers, models, and server configuration.

OpenCode inference: Inference API documentation
. The documented API includes a model-list endpoint at https://opencode.ai/inference/v1/models; the inference API's documented authentication is for making inference requests, not necessarily for obtaining a pricing catalog. 
OpenCode
+1

Hugging Face benchmark data: Leaderboard API documentation
. Its documented dataset leaderboard endpoint is GET /api/datasets/{dataset_id}/leaderboard. 
Hugging Face
+1

Existing plugin: opencode-model-scorecard repository
. It demonstrates a TUI-oriented model scorecard, with bundled model benchmark and pricing data, and a score refresh process. 
GitHub
+1

Important distinction: OpenCode's inference model list, the user's locally available OpenCode models, and the models covered by a pricing catalog are three different sets. The implementation must not assume they are identical.

2.2 Native sidebar feasibility gate

The reference scorecard is especially relevant because it uses a TUI-specific entry point and provides a command to inspect benchmark details. It does not establish that the standard plugin API supports arbitrary persistent sidebars. 
GitHub
+1

The coding agent must perform this feasibility investigation first:

Inspect the plugin documentation for a supported custom TUI component or panel registration mechanism.

Inspect the reference repository's tui.tsx, package.json, and relevant documentation.

Verify the UI mechanism against the exact installed OpenCode version.

Build a minimal proof of concept that renders a panel and toggles its visibility.

Record the result in /docs/architecture/ui-integration.md.

If a native sidebar is not supported, implement the data layer and command-driven table first. Keep the UI behind an adapter so a future native panel can reuse the same data and sorting logic. Do not claim the plugin has a persistent native sidebar until the proof of concept succeeds.

3. Intended user experience

The target UI is a model overview panel with a header, toolbar, sortable columns, and a collapsible state.

MOSP

v0.1.0

Filter models by name or provider…

GPQA
LiveCodeBench
Price: ascending

Model / Provider

GPQA

Input / 1M

Output / 1M

Example Model A

Provider A

1

$0.50

$2.00

Example Model B

Provider B

2

$1.00

$4.00

Example Model C

Provider C

—

N/A

N/A

Illustrative mock data only. Not actual model rankings or prices.

The final implementation should support:

Sortable columns: GPQA score/rank, input price, output price, model name, release date, LiveCodeBench score/rank, and provider.

A ranking selector that changes the active ranking column.

Ascending/descending sort toggling by clicking column headers.

Search by model name, provider, and model ID.

Optional filters for provider, missing benchmark data, and free models.

Mouse-click collapse/expand, plus a menu or command action.

Loading, empty, stale-data, partial-data, and error states.

A visible indication of the data source and last refresh time.

Stable sorting, including deterministic tie-breaking.

Keyboard-accessible controls where the UI framework supports them.

The table should not display a fake rank when a model has no benchmark result. Display N/A or —, and let users choose whether models without scores appear.

4. Repository structure

Use a modular architecture so the API adapters, ranking logic, table sorting, and UI can be tested independently.

opencode_mosp/
├── .envrc
├── .env.example
├── .gitignore
├── .npmrc
├── .editorconfig
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── data-flow.md
│   │   ├── ui-integration.md
│   │   ├── caching.md
│   │   └── decisions.md
│   ├── api/
│   │   ├── opencode-models.md
│   │   ├── opencode-pricing.md
│   │   ├── huggingface-gpqa.md
│   │   └── livecodebench.md
│   ├── development.md
│   ├── naming-conventions.md
│   ├── testing.md
│   └── release.md
├── scripts/
│   ├── refresh-benchmarks.ts
│   └── validate-data.ts
├── src/
│   ├── index.ts
│   ├── config/
│   │   └── config.ts
│   ├── domain/
│   │   ├── model.ts
│   │   ├── benchmark.ts
│   │   └── pricing.ts
│   ├── providers/
│   │   ├── opencode-models.ts
│   │   ├── opencode-pricing.ts
│   │   ├── huggingface-gpqa.ts
│   │   └── livecodebench.ts
│   ├── services/
│   │   ├── mosp.ts
│   │   ├── model-matching.ts
│   │   ├── ranking.ts
│   │   └── cache.ts
│   ├── ui/
│   │   ├── panel-controller.ts
│   │   ├── table.ts
│   │   └── state.ts
│   └── utils/
│       ├── fetch-json.ts
│       ├── logger.ts
│       └── result.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── bunfig.toml
├── README.md
├── CHANGELOG.md
└── LICENSE

The .opencode/plugins/ directory is the documented location for a project-local plugin. The repository can maintain src/index.ts as the source of truth and use a build or development script to place the runnable plugin in .opencode/plugins/. Alternatively, keep the entry point directly there and use imports from src/. Select one approach after confirming how the target OpenCode version loads local TypeScript modules. 
OpenCode

Recommended initial choice: use .opencode/plugins/opencode-mosp.ts as the thin runtime entry point and keep reusable modules under src/. Avoid maintaining two independent copies of plugin logic.

5. Coding standards and project configuration
5.1 Naming conventions

Apply the requested naming convention consistently. TypeScript types and interfaces should remain PascalCase because those are type declarations rather than runtime variables.

Identifier

	

Prefix

	

Example




Exported/runtime functions

	

f_

	

f_getAvailableModels()




Helper functions

	

fh_

	

fh_normalizeModelId()




Global variables

	

g_

	

g_refreshPromise




Constants

	

k_

	

k_priceScale




Function arguments and parameters

	

p_

	

p_modelId




Local variables

	

vl_

	

vl_models




Other runtime variables

	

v_

	

v_result




Types and interfaces

	

PascalCase

	

ModelRecord




Enum members / string unions

	

Descriptive names

	

"gpqa"




Files

	

kebab-case

	

model-matching.ts

Examples:

const k_priceScale = 1_000_000;

interface ModelRecord {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  readonly inputPricePerToken: number | null;
  readonly outputPricePerToken: number | null;
  readonly releaseDate: string | null;
}

function fh_normalizeModelId(p_modelId: string): string {
  const vl_normalizedId = p_modelId.trim().toLowerCase();

  return vl_normalizedId;
}

function f_getInputPricePerMillion(
  p_model: ModelRecord,
): number | null {
  if (p_model.inputPricePerToken === null) {
    return null;
  }

  const vl_pricePerMillion =
    p_model.inputPricePerToken * k_priceScale;

  return vl_pricePerMillion;
}

Rules:

Prefix every function, including callbacks and class methods, according to its role.

Prefix function parameters even in short callbacks.

Use k_ for constants, not mutable configuration or values obtained at runtime.

Use g_ only for genuinely shared mutable state; prefer dependency injection over global state.

Avoid default exports unless required by the plugin loading mechanism.

Use unknown at external-data boundaries, then validate it. Do not use any as a shortcut.

Use explicit return types for exported functions and complex helpers.

Keep complex implementation comments close to the code they explain. Put design rationale and cross-module architecture in /docs.

5.2 Bun and TypeScript version policy

The requested TypeScript 7.0-versus-6.0 rule should be treated as a compatibility policy, not an assumption that a particular release is available.

At setup time, have the coding agent:

Check the currently published stable TypeScript version.

Check whether that version is compatible with the selected OpenCode plugin SDK, lint tooling, and build pipeline.

If TypeScript 7.0 is stable and compatible, use it.

Otherwise, use TypeScript 6.0 if stable and compatible.

If neither is available or compatible, stop and document the blocker rather than silently selecting an unrelated major version.

Pin the chosen version in package.json and commit bun.lock.

OpenCode can execute TypeScript plugin files, but compiler version and runtime module compatibility are separate concerns. The plugin's own CI must perform an explicit type-check. 
OpenCode

5.3 Initial package.json

The following is the target configuration template. The coding agent must resolve and pin compatible stable dependency versions before committing it.


{
  "name": "opencode_mosp",
  "version": "0.1.0",
  "private": true,
  "description": "OpenCode model pricing and benchmark overview",
  "author": "GRASTROY Creations",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "check": "bun run typecheck && bun run lint && bun run test",
    "refresh:benchmarks": "bun run scripts/refresh-benchmarks.ts",
    "validate:data": "bun run scripts/validate-data.ts"
  },
  "dependencies": {
    "@opencode-ai/plugin": "PIN_COMPATIBLE_VERSION"
  },
  "devDependencies": {
    "@eslint/js": "PIN_COMPATIBLE_VERSION",
    "@types/bun": "PIN_COMPATIBLE_VERSION",
    "eslint": "PIN_COMPATIBLE_VERSION",
    "typescript": "PIN_COMPATIBLE_VERSION",
    "typescript-eslint": "PIN_COMPATIBLE_VERSION"
  }
}

PIN_COMPATIBLE_VERSION is a setup placeholder, not a valid package version. Resolve it before running the dependency installation.

Avoid adding a UI framework or HTTP client until the UI feasibility investigation and data-source investigation establish that they are needed. Bun provides fetch, and the OpenCode plugin package provides the plugin types.

5.4 TypeScript configuration

Create tsconfig.json:


{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["bun"],
    "noEmit": true
  },
  "include": [
    "src/**/*.ts",
    "scripts/**/*.ts",
    "tests/**/*.ts",
    ".opencode/plugins/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}

If the selected TypeScript version requires a configuration adjustment, document it in /docs/development.md. Do not weaken strictness simply to get the project to compile.

5.5 direnv configuration

Create .envrc:

# Local development configuration only.
# Do not put real API tokens in a committed file.

export PLUGIN_NAME="opencode_mosp"
export PLUGIN_VERSION="0.1.0"
export PLUGIN_OWNER="GRASTROY Creations"

export OPENCODE_MODEL_CACHE_TTL_SECONDS="3600"
export OPENCODE_BENCHMARK_CACHE_TTL_SECONDS="21600"
export OPENCODE_REQUEST_TIMEOUT_MS="10000"

# Optional credentials for sources that require authentication.
# Export these only in the local shell if you need them.
# export HUGGINGFACE_TOKEN="..."
# export OPENCODE_INFERENCE_API_KEY="..."

Create .env.example with the same variable names and safe placeholder values.

Then initialize the environment:

direnv allow
bun install
bun run typecheck

The coding agent must ensure .env, .envrc.local, local cache files, and any secrets are excluded from Git. direnv loads environment variables into the development shell; it does not automatically make those variables available to every OpenCode process or GUI launch. Verify the environment at the actual plugin runtime.

Never print secrets to logs, include them in error messages, or send OpenCode credentials to Hugging Face.

6. Domain model and normalization

Before writing API adapters, define the normalized model format that all sources will use.

Create src/domain/model.ts:

export type ModelSource =
  | "opencode"
  | "inference"
  | "merged";

export interface ModelPricing {
  readonly inputUsdPerMillionTokens: number | null;
  readonly outputUsdPerMillionTokens: number | null;
  readonly currency: "USD";
  readonly source: string | null;
  readonly observedAt: string | null;
}

export interface ModelBenchmark {
  readonly benchmarkId: "gpqa" | "livecodebench";
  readonly score: number | null;
  readonly rank: number | null;
  readonly sourceUrl: string | null;
  readonly evaluatedAt: string | null;
}

export interface ModelRecord {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly releaseDate: string | null;
  readonly contextWindow: number | null;
  readonly pricing: ModelPricing;
  readonly benchmarks: readonly ModelBenchmark[];
  readonly source: ModelSource;
  readonly lastUpdatedAt: string;
}

export type RankingMode = "gpqa" | "livecodebench";

export type SortDirection = "asc" | "desc";

export type ModelSortKey =
  | "name"
  | "providerName"
  | "releaseDate"
  | "gpqaScore"
  | "gpqaRank"
  | "livecodebenchScore"
  | "livecodebenchRank"
  | "inputPrice"
  | "outputPrice";
Data contract rules

Normalize prices to USD per one million tokens for display and sorting.

Do not assume every provider publishes prices.

Do not assume every benchmark has the same score range or ranking direction.

Keep score and rank as separate values.

Keep source URLs and timestamps attached to benchmark and pricing records.

Preserve the raw source identifiers during normalization for troubleshooting.

Treat missing dates, scores, and prices as null.

Do not substitute 0 for missing values.

This format is deliberately provider-independent. A model can be present in OpenCode while having no benchmark result or no published price.

7. API adapters

Implement the source adapters independently. The aggregator should never know the details of a particular HTTP response.

7.1 Shared JSON fetch helper

Create src/utils/fetch-json.ts:

export interface FetchJsonOptions {
  readonly timeoutMs: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export async function f_fetchJson<T>(
  p_url: string,
  p_options: FetchJsonOptions,
): Promise<T> {
  const vl_abortController = new AbortController();

  const vl_timeout = setTimeout(
    () => vl_abortController.abort(),
    p_options.timeoutMs,
  );

  try {
    const vl_response = await fetch(p_url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...p_options.headers,
      },
      signal: vl_abortController.signal,
    });

    if (!vl_response.ok) {
      throw new Error(
        `HTTP ${vl_response.status} while fetching ${new URL(p_url).host}`,
      );
    }

    return (await vl_response.json()) as T;
  } finally {
    clearTimeout(vl_timeout);
  }
}

Required improvement before production: validate the returned JSON using a runtime schema or explicit type guards. The generic type parameter above does not validate remote data. Do not include authorization headers or query-string secrets in thrown errors.

Implement retry behavior at the adapter or service layer, with a maximum attempt count and exponential backoff. Retry only appropriate transient failures, respect Retry-After, and do not retry authentication failures indefinitely.

7.2 OpenCode model discovery

Use the documented OpenCode SDK first to discover models and providers available to the current installation. Inspect the installed SDK's exact type definitions before coding the adapter.

Separately, query the documented OpenCode inference catalog if it is relevant to the selected pricing source:

const k_inferenceModelsUrl =
  "https://opencode.ai/inference/v1/models";

Do not treat this endpoint as a replacement for the user's local provider configuration.

Implementation tasks:

Read the current OpenCode SDK documentation.

Determine which SDK method returns providers and model metadata.

Inspect the installed @opencode-ai/plugin client and its exposed methods.

Build f_getAvailableModels() around the supported interface.

Normalize provider IDs, model IDs, display names, context windows, and source metadata.

Optionally query the inference model catalog in a separate adapter.

Merge the results using stable provider/model identifiers.

Mark each record's availability source.

The coding agent must record the actual endpoint/method and its response schema in /docs/api/opencode-models.md. It must not invent a pricing endpoint merely because a model-list endpoint exists.

7.3 OpenCode pricing

The scorecard repository documents that it uses OpenCode Data's model catalog for token costs and refreshes its bundled registry before publishing. This is a useful reference implementation and should be inspected before designing a replacement. 
GitHub
+1

Inspection tasks:

Examine scripts/, .opencode/, and docs/ in the reference repository.

Identify the precise pricing source, request URL, response schema, model identifier strategy, and normalization logic.

Check its license before copying or adapting implementation code.

Add an attribution note in the relevant source file if code is reused.

Write down any differences between the scorecard's source and the authenticated OpenCode inference catalog.

Do not assume that logging into OpenCode gives access to a public, authenticated pricing endpoint. The inference API documentation confirms model-list and inference functionality, but the pricing catalog and its authentication mechanism must be verified separately. 
OpenCode
+1

Create src/providers/opencode-pricing.ts with a source-specific interface:

export interface RawModelPrice {
  readonly providerId: string;
  readonly modelId: string;
  readonly inputUsdPerToken: number | null;
  readonly outputUsdPerToken: number | null;
  readonly source: string;
  readonly observedAt: string;
}

export function f_normalizeModelPrice(
  p_rawPrice: RawModelPrice,
): {
  readonly inputUsdPerMillionTokens: number | null;
  readonly outputUsdPerMillionTokens: number | null;
} {
  const k_priceScale = 1_000_000;

  return {
    inputUsdPerMillionTokens:
      p_rawPrice.inputUsdPerToken === null
        ? null
        : p_rawPrice.inputUsdPerToken * k_priceScale,
    outputUsdPerMillionTokens:
      p_rawPrice.outputUsdPerToken === null
        ? null
        : p_rawPrice.outputUsdPerToken * k_priceScale,
  };
}

The adapter must map the actual response into RawModelPrice; the type above is the internal contract, not a claim about the source API's raw schema.

Price normalization must be verified carefully. If a source already reports prices per million tokens, do not multiply them by one million again. Some sources may use different units for input, output, cached input, or reasoning tokens. Preserve those distinctions if the source supports them.

If the only reliable source is a bundled OpenCode Data catalog, implement a refresh script and local snapshot rather than pretending prices are fetched live from an authenticated endpoint.

7.4 Hugging Face GPQA benchmark adapter

The Hugging Face documentation supports fetching a dataset leaderboard using:

GET https://huggingface.co/api/datasets/{dataset_id}/leaderboard

The dataset ID must be selected explicitly and verified to contain the intended GPQA benchmark. 
Hugging Face
+1

Implementation steps:

Identify the target dataset and the exact GPQA variant.

Document the dataset ID and its license/provenance.

Test the leaderboard response and record a fixture.

Normalize model identifiers, score, rank if supplied, and source metadata.

Determine whether higher or lower scores are better for the selected benchmark.

Handle tied scores and missing results consistently.

Record retrieval time separately from the evaluation date.

Example URL construction:

export function f_buildHuggingFaceLeaderboardUrl(
  p_datasetId: string,
): string {
  const vl_encodedDatasetId = p_datasetId
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return (
    "https://huggingface.co/api/datasets/" +
    `${vl_encodedDatasetId}/leaderboard`
  );
}

The dataset ID should come from validated configuration, not untrusted model output. Do not hard-code a dataset name until the coding agent has confirmed its actual GPQA coverage and schema.

For public datasets, begin without authentication. Use HUGGINGFACE_TOKEN only when the selected resource requires it or when authenticated access is needed for rate limits.

7.5 LiveCodeBench adapter

LiveCodeBench should be an independent adapter rather than a special case inside the GPQA provider.

Tasks:

Identify the official public leaderboard or maintained data endpoint.

Verify that the endpoint is stable and permitted for automated use.

Record the benchmark version and evaluation protocol.

Determine whether the data is available through an API, a downloadable file, or source-controlled benchmark data.

Normalize the source's score and rank.

Preserve the benchmark version and evaluation date.

Add fixture-based tests so the rest of the plugin does not depend on a live service.

Do not invent an endpoint or infer an official ranking from a webpage's appearance. If the public leaderboard lacks a stable API, build a refresh script that downloads and validates the published data into a versioned local snapshot.

7.6 Model matching and alias resolution

Create src/services/model-matching.ts.

Use this matching order:

Exact provider ID and exact model ID.

Exact canonical model ID from the benchmark source.

Explicit, reviewed aliases.

Conservative normalized matching, only where unambiguous.

Example helper:

export function fh_normalizeModelId(
  p_modelId: string,
): string {
  return p_modelId
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

Do not automatically remove every punctuation character, version suffix, or provider prefix. That can merge different models incorrectly.

Maintain an alias registry with documented mappings:

export interface ModelAlias {
  readonly providerId: string;
  readonly canonicalModelId: string;
  readonly aliases: readonly string[];
  readonly reason: string;
}

Every uncertain match should be recorded as unmatched rather than silently assigning another model's benchmark score.

8. Ranking and table sorting

Implement the ranking logic as a pure service. It must not depend on the TUI framework or perform network requests.

8.1 Define ranking semantics

The primary ranking is GPQA, with LiveCodeBench as an alternative.

The UI should offer two separate concepts:

Score: the benchmark's reported value.

Rank: the model's position under the selected benchmark's scoring rules.

For GPQA, prefer the selected dataset's official ranking when its semantics are appropriate. Otherwise, calculate a rank from the normalized score, with ties handled consistently. For LiveCodeBench, use the same approach based on its documented scoring protocol.

Do not combine GPQA and LiveCodeBench into an arbitrary overall score in version 0.1.0.

8.2 Implement the comparator

Create src/services/ranking.ts:

import type {
  ModelRecord,
  ModelSortKey,
  SortDirection,
} from "../domain/model";

function fh_getSortValue(
  p_model: ModelRecord,
  p_key: ModelSortKey,
): string | number | null {
  switch (p_key) {
    case "name":
      return p_model.name;

    case "providerName":
      return p_model.providerName;

    case "releaseDate":
      return p_model.releaseDate;

    case "inputPrice":
      return p_model.pricing.inputUsdPerMillionTokens;

    case "outputPrice":
      return p_model.pricing.outputUsdPerMillionTokens;

    case "gpqaScore":
    case "gpqaRank":
    case "livecodebenchScore":
    case "livecodebenchRank": {
      const vl_benchmarkId =
        p_key.startsWith("gpqa") ? "gpqa" : "livecodebench";

      const vl_benchmark = p_model.benchmarks.find(
        (p_entry) => p_entry.benchmarkId === vl_benchmarkId,
      );

      if (!vl_benchmark) {
        return null;
      }

      return p_key.endsWith("Score")
        ? vl_benchmark.score
        : vl_benchmark.rank;
    }

    default: {
      const vl_exhaustiveCheck: never = p_key;
      return vl_exhaustiveCheck;
    }
  }
}

export function f_sortModels(
  p_models: readonly ModelRecord[],
  p_key: ModelSortKey,
  p_direction: SortDirection,
): ModelRecord[] {
  const vl_directionMultiplier = p_direction === "asc" ? 1 : -1;

  return [...p_models].sort((p_left, p_right) => {
    const vl_leftValue = fh_getSortValue(p_left, p_key);
    const vl_rightValue = fh_getSortValue(p_right, p_key);

    // Missing values stay at the end in either sort direction.
    if (vl_leftValue === null && vl_rightValue === null) {
      return p_left.id.localeCompare(p_right.id);
    }

    if (vl_leftValue === null) {
      return 1;
    }

    if (vl_rightValue === null) {
      return -1;
    }

    let vl_comparison = 0;

    if (
      typeof vl_leftValue === "number" &&
      typeof vl_rightValue === "number"
    ) {
      vl_comparison = vl_leftValue - vl_rightValue;
    } else {
      vl_comparison = String(vl_leftValue).localeCompare(
        String(vl_rightValue),
        undefined,
        { numeric: true, sensitivity: "base" },
      );
    }

    if (vl_comparison === 0) {
      return p_left.id.localeCompare(p_right.id);
    }

    return vl_comparison * vl_directionMultiplier;
  });
}

Review the code against the final ModelRecord definition and lint configuration during implementation.

The sorting requirements are:

Sorting must not mutate the input array.

Missing prices, ranks, and dates remain at the bottom.

Ties are deterministic.

Model-name sorting is case-insensitive and natural where possible.

Price sorting uses numeric values, never formatted currency strings.

Sorting by GPQA rank and sorting by GPQA score are distinct operations.

The UI must indicate which column is currently sorted and in which direction.

8.3 Ranking-specific ordering

A score column can have different semantics from a rank column. For example, higher GPQA scores may be better, while the rank column should put rank 1 first.

Set the initial default to:

Primary sort: gpqaRank

Direction: ascending

Missing benchmark data: bottom

For users who want to sort by price, use ascending order to show the cheapest models first. Output price should be independently sortable from input price.

9. Aggregation service

Create src/services/mosp.ts.

This service coordinates the adapters, matching, and caching layers. It should return normalized records even when one external source fails.

The intended flow is:

OpenCode SDK / provider models

Available models and metadata

Pricing and benchmark adapters

OpenCode Data · GPQA · LiveCodeBench

Normalize and match

Canonical IDs, aliases, units, timestamps

Merge and cache

Preserve partial results and provenance

Sortable model table

Search · ranking selector · collapse control

9.1 Required service functions

Use these function responsibilities:

f_getModelOverview() — retrieve a merged model snapshot.

f_refreshModelOverview() — refresh external sources and update the cache.

f_mergeModelSources() — merge source records without losing metadata.

f_matchBenchmarkRecords() — match benchmark records to available models.

f_getOverviewStatus() — return per-source freshness and error state.

f_sortModels() — sort records using the selected column.

f_filterModels() — apply search text and UI filters.

9.2 Failure isolation

Each source should be independently recoverable.

For example:

If GPQA is unavailable, show models with GPQA values marked missing.

If pricing is unavailable, retain benchmark data.

If LiveCodeBench is unavailable, preserve GPQA ordering.

If the model catalog cannot be retrieved, display a cached catalog if one exists and clearly label it as stale.

If no cache exists, show a useful error rather than a fabricated empty success.

Do not make the entire service fail because one benchmark endpoint is unavailable.

10. Caching and refresh policy

A model overview makes multiple network requests. It should not refetch every source whenever the user clicks a sort header.

Implement a small cache abstraction with:

Source-specific cache keys.

Data retrieval timestamp.

Data freshness timestamp or source evaluation date, where provided.

Cache schema version.

Optional last-known-good snapshot.

Source-specific TTL values.

In-flight request deduplication.

Suggested initial TTLs:

Data source

	

Initial refresh interval




Installed OpenCode model list

	

1 hour




Pricing catalog

	

1 hour




GPQA leaderboard

	

6 hours




LiveCodeBench leaderboard

	

6 hours

These are defaults to tune after testing, not guarantees about source update frequency.

The UI's refresh action should invalidate or refresh source data, not clear user preferences or destroy the last-known-good cache.

Store persistent cache data in an appropriate user cache directory, not in the repository or a shared project directory containing secrets. Use atomic writes and validate cached data before use.

Document cache invalidation and failure handling in /docs/architecture/caching.md.

11. UI implementation plan
11.1 Separate the controller from the renderer

Create src/ui/panel-controller.ts and src/ui/state.ts.

The controller should expose operations such as:

export interface ModelOverviewUIState {
  readonly isCollapsed: boolean;
  readonly searchText: string;
  readonly sortKey: ModelSortKey;
  readonly sortDirection: SortDirection;
  readonly rankingMode: RankingMode;
  readonly isRefreshing: boolean;
  readonly lastRefreshAt: string | null;
}

Implement:

f_togglePanel() — invert collapsed state.

f_setSort() — update the sort key and direction.

f_setRankingMode() — switch the benchmark used for primary ranking.

f_setSearchText() — update the search query.

f_refresh() — request refreshed data.

f_getVisibleModels() — return filtered and sorted records.

Use the UI framework's native state mechanism where available. If the supported OpenCode integration only permits commands, map these operations to command actions instead of pretending they are mouse-interactive controls.

11.2 Collapse and expand behavior

The user explicitly requires two ways to collapse the panel:

Mouse click on a panel toggle.

A menu or command option.

Acceptance criteria:

The toggle changes state immediately.

Repeated clicks do not trigger additional data fetches.

Sorting and search state survive collapse/expand.

The selected ranking survives collapse/expand.

The menu command can both collapse and expand the panel.

The collapsed state is persisted if the host provides an appropriate supported persistence mechanism.

If no native sidebar exists, the fallback UI must clearly document its interaction limitations.

The OpenCode TUI supports mouse configuration, but that alone does not establish that arbitrary plugin components can register their own mouse handlers. 
OpenCode
+1

11.3 Table behavior

The table must support:

Fixed or sticky headers when supported by the UI framework.

Scrollable rows.

Sorting by every numeric and textual column.

A ranking selector for GPQA and LiveCodeBench.

Search and provider filtering.

Clear indicators for missing values.

A refresh control and last-updated timestamp.

An empty-state message when filters return no results.

A stale-data indicator when cached results are being shown.

Source details for price and benchmark values.

If a browser dashboard is used as the fallback, implement proper semantic table markup and accessible buttons. Do not add a large React/Vite frontend until the native UI feasibility decision has been made.

12. Commands and menu integration

Create a documented command interface for the fallback implementation.

Proposed commands:

Command

	

Action




/mosp

	

Open or display the model overview




/mosp refresh

	

Refresh model, price, and benchmark data




/mosp sort gpqa

	

Sort by GPQA rank




/mosp sort input-price

	

Sort by input price




/mosp sort output-price

	

Sort by output price




/mosp ranking livecodebench

	

Switch primary ranking




/mosp toggle

	

Toggle visibility or display mode




/mosp status

	

Display source freshness and errors

These are product-level command specifications. The coding agent must map them to supported OpenCode plugin hooks or custom tools. A plugin hook by itself does not automatically register a slash command.

The official plugin documentation confirms support for custom tools and TUI-related events; use these only for their documented purposes. 
OpenCode
+1

For an implementation based on custom tools, create a tool that returns a formatted table or structured output. Keep its data retrieval logic in src/services/, not inside the tool's execute function.

13. ESLint and code quality

Create eslint.config.js using the flat configuration supported by the selected ESLint release.

Required linting rules:

TypeScript-aware recommended rules.

No explicit any.

No unused variables or imports.

Consistent type imports.

No accidental floating promises.

No unsafe type assertions at external-data boundaries.

Naming-convention checks for runtime identifiers, where practical.

No secrets in source code or fixtures.

No disabling rules globally to accommodate one file.

Add a naming convention document at /docs/naming-conventions.md that distinguishes mandatory prefixes from exceptions imposed by TypeScript, OpenCode's API, or third-party libraries.

The CI pipeline must run:

bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test

Do not run automated fix commands in CI. CI should detect violations, not modify the working tree.

14. Testing strategy

Use Bun's test runner for unit and integration tests.

14.1 Unit tests

Create tests for:

Model ID normalization.

Alias resolution.

Price normalization.

Missing price handling.

GPQA score-to-rank calculation.

LiveCodeBench score-to-rank calculation.

Sorting in both directions.

Missing values staying at the bottom.

Stable tie-breaking.

Search and provider filters.

Cache TTL handling.

Malformed source data.

Timeout and HTTP error handling.

Example test for sorting:

import { describe, expect, test } from "bun:test";
import { f_sortModels } from "../../src/services/ranking";
import type { ModelRecord } from "../../src/domain/model";

const vl_models: ModelRecord[] = [
  {
    id: "provider/model-b",
    name: "Model B",
    providerId: "provider",
    providerName: "Provider",
    releaseDate: null,
    contextWindow: null,
    pricing: {
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 8,
      currency: "USD",
      source: "fixture",
      observedAt: null,
    },
    benchmarks: [],
    source: "merged",
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "provider/model-a",
    name: "Model A",
    providerId: "provider",
    providerName: "Provider",
    releaseDate: null,
    contextWindow: null,
    pricing: {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 4,
      currency: "USD",
      source: "fixture",
      observedAt: null,
    },
    benchmarks: [],
    source: "merged",
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("f_sortModels", () => {
  test("sorts input prices from lowest to highest", () => {
    const vl_result = f_sortModels(
      vl_models,
      "inputPrice",
      "asc",
    );

    expect(vl_result.map((p_model) => p_model.name)).toEqual([
      "Model A",
      "Model B",
    ]);
  });

  test("does not mutate the input array", () => {
    const vl_originalIds = vl_models.map((p_model) => p_model.id);

    f_sortModels(vl_models, "inputPrice", "desc");

    expect(vl_models.map((p_model) => p_model.id)).toEqual(
      vl_originalIds,
    );
  });
});
14.2 Integration tests

Use mocked network responses and committed fixtures. Never require live API access for ordinary CI tests.

Integration scenarios:

All sources respond successfully.

OpenCode responds, but GPQA fails.

Pricing responds, but LiveCodeBench fails.

An external benchmark returns an unknown model.

A model alias maps to exactly one canonical model.

A model alias matches more than one model and must be rejected as ambiguous.

Pricing is already per million tokens and must not be scaled twice.

An API returns malformed JSON or a changed response schema.

A timeout occurs while a valid cached snapshot exists.

A refresh is triggered twice concurrently.

The table switches between GPQA and LiveCodeBench.

The panel toggle is invoked repeatedly without altering the data cache.

14.3 UI feasibility and smoke tests

The first end-to-end test should establish that the chosen UI entry point actually works in the target OpenCode release.

Verify:

Plugin loads without errors.

The command or UI entry point is discoverable.

The model table renders.

The panel can be collapsed and expanded through the supported mechanism.

Sorting updates the displayed order.

Refresh failures do not crash OpenCode.

A missing benchmark does not prevent the other columns from rendering.

If native side-panel injection fails, stop and reassess the UI integration before building out the complete renderer.

15. Documentation requirements

All architectural decisions and patterns must be documented under /docs in Markdown. Complex code paths must also have explanatory inline comments.

Document

	

Required contents




architecture/overview.md

	

Modules, responsibilities, dependency boundaries and design rationale




architecture/data-flow.md

	

Data-source diagram, normalization, matching and merge order




architecture/ui-integration.md

	

Native sidebar investigation, proof of concept, fallback choice




architecture/caching.md

	

TTLs, invalidation, persistence, atomic writes and stale-data handling




architecture/decisions.md

	

Architectural decision records and rejected alternatives




api/opencode-models.md

	

Exact SDK method/endpoint, types, response examples




api/opencode-pricing.md

	

Verified price source, authentication, units and attribution




api/huggingface-gpqa.md

	

Dataset ID, GPQA variant, score direction and response schema




api/livecodebench.md

	

Official source, protocol, refresh mechanism and versioning




development.md

	

Bun, direnv, TypeScript, ESLint and setup commands




naming-conventions.md

	

Required prefixes and permitted exceptions




testing.md

	

Test layers, fixtures, CI requirements and acceptance tests




release.md

	

Versioning, package validation, license and release procedure

Every API document must clearly distinguish verified behavior from assumptions. Record the verification date, source URL, required authentication, rate limits, data license, and example response.

Inline comments should explain non-obvious decisions such as benchmark score direction, alias collision handling, price-unit conversion, tie-breaking, and cache consistency. Do not duplicate entire architecture documents in source comments.

16. Git and repository hygiene

Create .gitignore:

node_modules/
dist/
coverage/
.env
.env.*
!.env.example
.envrc.local
.direnv/
.cache/
*.log
.DS_Store

Because .env.* also matches .env.example, the explicit exception is important. Ensure the actual .envrc contains no secrets before committing it.

Initialize Git:

git init
git add .
git status --short
git diff --cached

Before the initial commit, check that the staged changes contain no API keys, local cache data, personal paths, or generated artifacts.

Your requirement is that you perform commits and pushes yourself. Coding agents must not execute git commit, git push, publish a package, or create a release unless you explicitly authorize that work later.

The agent can prepare changes, run tests, inspect the staged diff, and report the commands you can execute.

17. MIT license and project metadata

Create LICENSE with the standard MIT License text.

Use the following metadata:

Copyright holder: GRASTROY Creations.

Package version: 0.1.0.

License: MIT.

Repository/package name: opencode_mosp.

Have the maintainer provide the appropriate copyright year and legal entity details if needed. Do not invent a legal company address or other corporate identifiers.

The README must include the project purpose, installation, supported OpenCode versions, configuration, data sources, benchmark methodology, pricing units, limitations, security policy, license, and development instructions.

18. Execution plan for coding agents

Implement the project in the following order. Each phase has a defined deliverable and a completion gate. Do not skip a gate merely to proceed with UI work.

Phase overview
01

Environment and feasibility

Bun, direnv, OpenCode SDK, native sidebar proof of concept

02

Repository and tooling

Structure, TypeScript, ESLint, Git hygiene

03

Domain contracts

Model types, prices, benchmarks, naming conventions

04

Data adapters

OpenCode models, pricing, GPQA, LiveCodeBench

05

Matching and ranking

Canonical IDs, aliases, sorting and filters

06

Aggregation and caching

Partial failures, refresh, persistence and freshness

07

User interface

Table, controls, collapse/expand, menu or commands

08

Testing and security

Unit, integration, UI smoke tests and CI

09

Documentation and release prep

README, MIT, version 0.1.0 and manual Git handoff

Phase 1 — Environment and feasibility

Step 1.1 — Inspect the environment

Check Bun, direnv, Git, Node compatibility where required, and the installed OpenCode version.
Confirm the current OpenCode plugin API and SDK package.
Verify the supported TypeScript compiler version.
Inspect the reference scorecard's tui.tsx, package manifest, refresh scripts, tests, and documentation.

Step 1.2 — Prove the UI integration

Create the smallest possible plugin.
Verify the supported interaction and rendering mechanism.
Test mouse and command-driven visibility changes.
Document the result in docs/architecture/ui-integration.md.

Completion gate: A working UI proof of concept or a documented decision to use the supported command-driven fallback.

Phase 2 — Repository and tooling

Step 2.1

Create the directory structure.
Add package.json, tsconfig.json, eslint.config.js, bunfig.toml, .editorconfig, .gitignore, .env.example, and .envrc.
Resolve and pin compatible dependency versions.
Run direnv allow and bun install.
Generate and commit-ready-check bun.lock.

Step 2.2

Add the MIT license.
Add the documentation skeleton.
Verify that no credentials or generated files are staged.

Completion gate: The project installs successfully, and type checking and linting run even before the full implementation exists.

Phase 3 — Domain contracts

Step 3.1

Implement ModelRecord, ModelPricing, and ModelBenchmark.
Define source identifiers and normalized price units.
Define the sort-key and ranking-mode unions.

Step 3.2

Implement external-data validation.
Define missing-data and source-status representations.
Document how score, rank, release date, and retrieval date differ.

Completion gate: Unit tests validate the domain types and normalization contracts without network access.

Phase 4 — Data adapters

Step 4.1 — OpenCode models

Implement the SDK/provider discovery adapter.
Verify how configured and available models are represented.
Record the exact API method and schema.

Step 4.2 — Pricing

Inspect the scorecard's price refresh code.
Verify the source and its license.
Implement the source adapter.
Confirm input/output units and currency.
Add price fixtures and normalization tests.

Step 4.3 — GPQA

Select and verify the dataset.
Implement the leaderboard fetcher.
Validate score direction and model identifiers.
Save a representative fixture.

Step 4.4 — LiveCodeBench

Verify the official leaderboard data source.
Implement the API or snapshot refresh adapter.
Record benchmark version and evaluation protocol.
Save a representative fixture.

Completion gate: Each adapter passes fixture-based tests independently. No adapter depends on a live service for ordinary unit tests.

Phase 5 — Matching and ranking
Implement canonical model-ID normalization.
Implement an explicit alias registry.
Reject ambiguous matches.
Implement GPQA and LiveCodeBench rank calculations where needed.
Implement stable sorting for all requested columns.
Implement search and filtering.
Test missing values, ties, and sort direction.

Completion gate: All model rows sort deterministically, and missing benchmark data never receives an invented score or rank.

Phase 6 — Aggregation and caching
Implement the overview service.
Fetch sources independently.
Merge model, price, and benchmark data.
Preserve provenance and timestamps.
Add per-source TTLs.
Add in-flight request deduplication.
Add atomic cache writes and schema validation.
Preserve last-known-good data during temporary failures.
Add a source-status response for the UI.

Completion gate: The overview service returns usable partial results when any one optional data source fails.

Phase 7 — User interface
Implement the table renderer.
Add all sortable columns.
Add GPQA and LiveCodeBench ranking selection.
Add search and provider filters.
Add refresh, loading, stale-data, and error states.
Implement mouse-click collapse/expand if supported.
Implement the menu or command alternative.
Persist UI preferences using a supported mechanism.
Verify that sorting does not trigger network requests.

Completion gate: The table is usable with both complete and incomplete source data, and the documented collapse/expand mechanism works.

Phase 8 — Testing, security, and CI
Run all unit tests.
Run adapter integration tests with mocked HTTP responses.
Run UI smoke tests in the target OpenCode version.
Check timeout, rate-limit, authentication, and malformed-response handling.
Confirm that secrets are not logged or committed.
Add a GitHub Actions workflow.
Verify bun install --frozen-lockfile, type checking, linting, and tests in CI.

Completion gate: The entire CI pipeline passes, and the UI feasibility proof remains valid for the targeted OpenCode release.

Phase 9 — Documentation and release preparation
Complete all architecture and API documents.
Complete the README and changelog.
Confirm the package version is 0.1.0.
Confirm the MIT license and GRASTROY Creations attribution.
Verify the final package contents and installation instructions.
Produce a summary of changes, test results, known limitations, and outstanding decisions.
Hand control back to you for Git commits and pushes.

Completion gate: The project is ready for your review, but no commit, push, or publication has been performed by the agent.

19. Definition of done for version 0.1.0

Use this checklist for final acceptance.

Acceptance checklist

0 / 18

Plugin loads in the targeted OpenCode version without runtime errors.
All models available through the selected OpenCode discovery mechanism are represented.
Pricing is normalized to USD per million input/output tokens when the source provides verified prices.
GPQA data includes the benchmark variant, source, and evaluation metadata where available.
LiveCodeBench ranking can be selected independently from GPQA.
Models without benchmark scores or prices are displayed without fabricated values.
Every requested table column is sortable in both directions.
Sorting is deterministic and keeps missing values at the bottom.
Search and filters operate on the normalized model records.
Collapse/expand works through the verified UI mechanism or documented fallback.
A menu or command action can toggle the panel/display.
Source failures are isolated, with stale-data status shown when applicable.
Unit tests, integration tests, linting, and type checking pass.
All architecture and data-source documents are maintained under docs/.
Complex code paths contain explanatory comments.
Secrets, local caches, and generated files are excluded from Git.
Version, owner, and license metadata are correct.
No Git commit, push, or package publication has been performed by the coding agent.
Reset checklist
Copy checklist
20. Master instruction for the coding agent

The following instruction can be used as the initial task prompt for an autonomous coding agent.
# Task: Implement opencode_mosp

You are the implementation agent for `opencode_mosp`, owned by GRASTROY Creations, version 0.1.0, MIT License.

## Objective

Implement a modular OpenCode plugin using Bun and TypeScript that provides a searchable, sortable overview of models available to the current OpenCode installation, including OpenCode pricing, GPQA benchmark results, and LiveCodeBench ranking data.

The target interface is a collapsible side panel with a table. A native side panel is a hard feasibility requirement to investigate first. Do not claim support for arbitrary sidebar injection unless verified against the documented API and the target OpenCode version. If unsupported, implement the best supported command-driven fallback and document the limitation.

## Mandatory process

1. Inspect the official OpenCode plugin documentation and SDK.
2. Inspect the `bnc4vk/opencode-model-scorecard` repository, especially its pricing source, refresh scripts, `tui.tsx`, package configuration, tests, and license.
3. Verify the model discovery, pricing, Hugging Face GPQA, and LiveCodeBench data sources. Never invent endpoints, fields, scores, prices, or authentication mechanisms.
4. Establish the native UI feasibility result before implementing the full renderer.
5. Create and maintain the modular repository structure defined in the project execution plan.
6. Implement and test the domain contracts before the data adapters.
7. Implement the adapters, model matching, ranking, aggregation, and cache as independent modules.
8. Implement the UI only through supported OpenCode extension points.
9. Add unit tests, mocked integration tests, UI smoke tests, ESLint, strict TypeScript checks, and CI.
10. Maintain architecture and API documentation under `/docs` and explanatory comments for complex code paths.
11. Finish by running all checks and reporting actual results.

## Coding conventions

* Functions: `f_`
* Helper functions: `fh_`
* Globals: `g_`
* Constants: `k_`
* Parameters: `p_`
* Local variables: `vl_`
* Other runtime variables: `v_`
* Types/interfaces: PascalCase
* Filenames: kebab-case

Use strict TypeScript, validate external data, avoid `any`, preserve provenance, and use deterministic sorting. Missing data must remain missing rather than being replaced with fabricated values.

Resolve and pin the newest compatible stable TypeScript version according to the project's version policy. Use Bun for package management and testing, and direnv for local environment variables.

## Data and UI requirements

* Discover the models available through OpenCode's supported model/provider interfaces.
* Use verified OpenCode pricing data where available.
* Display normalized input and output prices per million tokens.
* Use a verified Hugging Face GPQA leaderboard as the primary ranking source.
* Provide LiveCodeBench as an alternative ranking source.
* Support sorting by GPQA rank/score, LiveCodeBench rank/score, input/output price, model name, provider, and release date.
* Support search, missing-data handling, provenance, freshness, and source-specific errors.
* Support collapse/expand by mouse click and a menu or command action wherever the verified UI integration permits it.

## Documentation

Maintain:

* Architecture and data-flow diagrams
* UI feasibility decision
* Cache and error-handling strategy
* API endpoints, schemas, authentication, pricing units, and benchmark methodology
* Development and testing instructions
* Naming conventions and release instructions

## Git and release restrictions

Do not execute `git commit`, `git push`, package publication, or release creation. The repository owner will perform these actions.

## Deliverables

Produce the working implementation, test suite, documentation, package configuration, MIT license, and README. At completion, report:

* Files created and changed
* Verified data sources and remaining uncertainties
* Native UI feasibility result
* Test, lint, and type-check results
* Installation instructions
* Known limitations
* Any manual steps required from the repository owner

Do not claim a feature or test is complete unless it has actually been verified.


21. Recommended implementation priorities

For the first release, prioritize reliable data and sorting over sophisticated UI features.

First: verify the supported UI integration, model catalog, and actual pricing source.

Second: implement normalized records, matching, ranking, and sorting.

Third: implement resilient aggregation, caching, and source freshness.

Fourth: deliver the collapsible table through the supported UI mechanism.

Fifth: complete tests, documentation, and release preparation.

The highest-risk requirement is the native side panel, followed by reliable model-to-benchmark matching and verification of authenticated pricing availability. Resolve these early rather than allowing them to block the project near completion.
