import { createApiResponse, handleCorsOptions } from "./_apiUtils.js";

const n = { type: "number" };
const s = { type: "string" };
const b = { type: "boolean" };

const solarSchema = {
  type: "object", required: ["panelPowerWp", "panelCount", "systemEfficiency"],
  description: "Solar panel configuration",
  properties: { panelPowerWp: { ...n, description: "Power per panel (Wp)" }, panelCount: { ...n, description: "Number of panels" }, systemEfficiency: { ...n, description: "System efficiency (0-1)", minimum: 0, maximum: 1 } }
};

const batterySchema = {
  type: "object", required: ["batteryMode", "batteryValue", "nominalVoltage", "maxDepthOfDischarge"],
  description: "Battery configuration. batteryMode and batteryValue can also be sent via systemParameters for backwards compatibility.",
  properties: {
    batteryMode: { type: "string", enum: ["ah", "autonomyDays"], description: "ah = specify capacity directly, autonomyDays = specify desired autonomy in days" },
    batteryValue: { ...n, description: "Capacity in Ah or autonomy in days (depends on batteryMode)" },
    nominalVoltage: { ...n, description: "Nominal battery voltage (V)" },
    maxDepthOfDischarge: { ...n, description: "Max depth of discharge (0-1)", minimum: 0, maximum: 1 }
  }
};

const fuelSourceSchema = {
  type: "object", required: ["purchaseCost", "powerW", "fuelConsumptionPerKWh", "fuelPrice", "lifetime", "annualMaintenance"],
  properties: {
    purchaseCost: { ...n, description: "Purchase cost (NOK)" },
    powerW: { ...n, description: "Power output (W)" },
    fuelConsumptionPerKWh: { ...n, description: "Fuel consumption (l/kWh)" },
    fuelPrice: { ...n, description: "Fuel price (NOK/l)" },
    lifetime: { ...n, description: "Technical lifetime (hours)" },
    annualMaintenance: { ...n, description: "Annual maintenance cost (NOK)" }
  }
};

const backupSourceSchema = {
  type: "object", required: ["hasBackupSource"],
  description: "Backup power source. When hasBackupSource=true, fuelCell, diesel and other must be provided.",
  properties: {
    hasBackupSource: { ...b, description: "Does the system have a backup source?" },
    fuelCell: { ...fuelSourceSchema, description: "Fuel cell (methanol)" },
    diesel: { ...fuelSourceSchema, description: "Diesel generator" }
  }
};

const otherSchema = {
  type: "object", required: ["co2Methanol", "co2Diesel", "evaluationHorizonYears"],
  description: "Economic and environmental parameters. Required when hasBackupSource=true.",
  properties: {
    co2Methanol: { ...n, description: "CO2 factor fuel cell (kg/l)" },
    co2Diesel: { ...n, description: "CO2 factor diesel (kg/l)" },
    evaluationHorizonYears: { ...n, description: "Evaluation horizon (years)" }
  }
};

const monthlySchema = {
  type: "object", required: ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"],
  description: "Monthly solar radiation (kWh/m2/day).",
  properties: { jan: n, feb: n, mar: n, apr: n, mai: n, jun: n, jul: n, aug: n, sep: n, okt: n, nov: n, des: n }
};

const equipmentRowSchema = {
  type: "object", required: ["active", "name", "powerW", "runtimeHoursPerDay"],
  properties: {
    active: { ...b, description: "Is the row active?" },
    name: { ...s, description: "Equipment name" },
    powerW: { ...n, description: "Power (W)" },
    runtimeHoursPerDay: { ...n, description: "Runtime hours per day (0-24)", minimum: 0, maximum: 24 }
  }
};

const equipmentBudgetRowSchema = {
  type: "object",
  properties: { id: s, active: b, name: s, powerW: n, currentA: n, runtimeHoursPerDay: n, whPerDay: n, ahPerDay: n, whPerMonth: n, ahPerMonth: n, whPerWeek: n, ahPerWeek: n }
};

const monthlyBalanceSchema = {
  type: "object",
  properties: { month: s, label: s, daysInMonth: n, solarProductionKWh: n, loadDemandKWh: n, energyBalanceKWh: n, secondaryRuntimeHours: n, fuelLiters: n, fuelCost: n }
};

const costItemSchema = {
  type: "object",
  properties: { source: s, purchaseCost: n, operatingCostPerYear: n, annualMaintenance: n, evaluationHorizonYears: n, technicalLifetimeHours: n, totalRuntimeHours: n, annualFuelConsumption: n, annualCo2: n, toc: { ...n, description: "Total cost of ownership over evaluation period (NOK)" } }
};

const scenarioSchema = {
  type: "object",
  properties: { source: s, monthlyEnergyBalance: { type: "array", items: monthlyBalanceSchema }, annualTotals: { type: "object" }, secondarySourcePowerW: n, costItem: costItemSchema }
};

const calculationsResponseSchema = {
  type: "object",
  properties: {
    equipmentBudgetRows: { type: "array", items: equipmentBudgetRowSchema, description: "Power budget per equipment row" },
    totals: { type: "object", properties: { totalWhPerDay: n, totalAhPerDay: n, totalWhPerWeek: n, totalAhPerWeek: n }, description: "Total consumption" },
    battery: { type: "object", properties: { inputMode: s, inputValue: n, capacityAh: n, autonomyDays: n }, description: "Battery result" },
    annualEnergyDeficitKWh: { ...n, description: "Annual energy deficit (kWh)" },
    monthlyEnergyBalance: { type: "array", items: monthlyBalanceSchema, description: "Energy balance per month" },
    annualTotals: { type: "object", description: "Annual totals for solar production, load, balance, fuel and CO2" },
    costComparison: { type: "object", properties: { annualEnergyDeficitKWh: n, items: { type: "array", items: costItemSchema } }, description: "Cost comparison fuel cell vs diesel" },
    scenarios: { type: "object", properties: { fuelCell: scenarioSchema, diesel: scenarioSchema }, description: "Full scenario for each backup source" }
  }
};

const nveidPathParameter = {
  name: "nveID",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
  description: "NVE power station ID"
};

const endpointInfoSchema = {
  type: "object",
  properties: {
    method: s,
    path: s,
    description: s
  }
};

const nveidIndexSchema = {
  type: "object",
  properties: {
    path: s,
    description: s,
    endpoints: { type: "array", items: endpointInfoSchema }
  }
};

const nveidStationIndexSchema = {
  type: "object",
  properties: {
    path: s,
    nveID: { type: "integer" },
    description: s,
    endpoints: { type: "array", items: endpointInfoSchema },
    links: { type: "object", additionalProperties: s }
  }
};

const minimumFlowIntakeSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    navn: s,
    sommer_ls: n,
    vinter_ls: n
  }
};

const minimumFlowResponseSchema = {
  type: "object",
  properties: {
    nveID: { type: "integer" },
    navn: s,
    funnet: b,
    inntak: { type: "array", items: minimumFlowIntakeSchema }
  }
};

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "HydroGuide API",
    version: "1.0.0",
    description: "Public API for HydroGuide calculations and minimum-flow data."
  },
  servers: [{ url: "/api" }],
  tags: [
    { name: "Calculations", description: "Energy calculations" },
    { name: "NVEID", description: "Minimum-flow data by NVEID" }
  ],
  paths: {
    "/nveid": {
      get: {
        tags: ["NVEID"],
        summary: "List NVEID endpoints",
        description: "Returns available NVEID data endpoints.",
        responses: {
          "200": { description: "Endpoint list", content: { "application/json": { schema: { $ref: "#/components/schemas/NveidIndex" } } } }
        }
      }
    },
    "/nveid/{nveID}": {
      get: {
        tags: ["NVEID"],
        summary: "Get power station data endpoints",
        description: "Returns data endpoints for the power station corresponding to the given NVEID.",
        parameters: [nveidPathParameter],
        responses: {
          "200": { description: "Endpoint list for one power station", content: { "application/json": { schema: { $ref: "#/components/schemas/NveidStationIndex" } } } },
          "400": { description: "Invalid NVEID" },
          "404": { description: "NVEID resource not found" }
        }
      }
    },
    "/nveid/{nveID}/minimum-flow": {
      get: {
        tags: ["NVEID"],
        summary: "Get minimum-flow data",
        description: "Returns minimum-flow data for the power station corresponding to the given NVEID.",
        parameters: [nveidPathParameter],
        responses: {
          "200": { description: "Minimum-flow data", content: { "application/json": { schema: { $ref: "#/components/schemas/MinimumFlowResponse" } } } },
          "400": { description: "Invalid NVEID" },
          "404": { description: "No data for NVEID" },
          "503": { description: "Minimum-flow data unavailable" }
        }
      }
    },
    "/nveid/{nveID}/concession": {
      get: {
        tags: ["NVEID"],
        summary: "Get concession link",
        description: "Returns the NVE concession (konsesjonssak) link for the power station corresponding to the given NVEID.",
        parameters: [nveidPathParameter],
        responses: {
          "200": { description: "Concession link", content: { "application/json": { schema: { type: "object", properties: { nveID: { type: "string" }, kdbNr: { type: "string" }, concessionUrl: { type: "string", format: "uri" } } } } } },
          "400": { description: "Invalid NVEID" },
          "404": { description: "No data for NVEID" }
        }
      }
    },
    "/calculations": {
      post: {
        tags: ["Calculations"],
        summary: "Run calculations",
        description: "Send the same payload as the website export file. All fields in solar, battery and monthlySolarRadiation are required. Backup source fields (fuelCell, diesel, other) are required when hasBackupSource=true.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CalculationsRequest" } } }
        },
        responses: {
          "200": { description: "Successful calculation", content: { "application/json": { schema: { $ref: "#/components/schemas/CalculationsResponse" } } } },
          "400": { description: "Invalid request (bad JSON, empty body, too large)" },
          "401": { description: "Invalid or missing API key" },
          "422": { description: "Validation error. Field keys in validationErrors show what is missing.", content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } } },
          "429": { description: "Rate limited. retry-after header indicates wait time." }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "API key" }
    },
    schemas: {
      CalculationsRequest: {
        type: "object",
        required: ["solar", "battery", "monthlySolarRadiation", "equipmentRows"],
        properties: {
          solar: solarSchema,
          battery: batterySchema,
          backupSource: backupSourceSchema,
          other: otherSchema,
          monthlySolarRadiation: monthlySchema,
          equipmentRows: { type: "array", items: equipmentRowSchema, description: "Equipment list. Max 200 rows." }
        }
      },
      CalculationsResponse: {
        type: "object",
        properties: {
          calculations: calculationsResponseSchema,
          usage: { type: "object", properties: { requests_remaining: { type: "integer" }, reset_at: { type: "string", format: "date-time" } } }
        }
      },
      NveidIndex: nveidIndexSchema,
      NveidStationIndex: nveidStationIndexSchema,
      MinimumFlowResponse: minimumFlowResponseSchema,
      ValidationError: {
        type: "object",
        properties: { error: s, validationErrors: { type: "object", additionalProperties: s }, usage: { type: "object" } }
      }
    }
  }
};

const SWAGGER_CSS_SRI = "sha384-rcbEi6xgdPk0iWkAQzT2F3FeBJXdG+ydrawGlfHAFIZG7wU6aKbQaRewysYpmrlW";
const SWAGGER_JS_SRI = "sha384-NXtFPpN61oWCuN4D42K6Zd5Rt2+uxeIT36R7kpXBuY9tLnZorzrJ4ykpqwJfgjpZ";
const INLINE_SCRIPT = `SwaggerUIBundle({url:"/api/docs",dom_id:"#s",deepLinking:true,docExpansion:"list",defaultModelRendering:"model",defaultModelExpandDepth:3,defaultModelsExpandDepth:2})`;

function buildUiHtml(nonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HydroGuide API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" integrity="${SWAGGER_CSS_SRI}" crossorigin="anonymous">
<style>html,body{margin:0;background:#fff}#s{min-height:100vh}.swagger-ui .wrapper{max-width:none!important;padding:0 24px}.swagger-ui .information-container.wrapper{padding-top:16px}.swagger-ui .example,.swagger-ui .body-param__example,.swagger-ui .model-example,.swagger-ui .tab li.tabitem:first-child{display:none!important}</style></head>
<body><div id="s"></div><script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js" integrity="${SWAGGER_JS_SRI}" crossorigin="anonymous"></script>
<script nonce="${nonce}">${INLINE_SCRIPT}</script></body></html>`;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.has("ui")) {
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    return new Response(buildUiHtml(nonce), {
      headers: {
        "content-type": "text/html;charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": `default-src 'none'; script-src https://unpkg.com 'nonce-${nonce}'; style-src https://unpkg.com 'unsafe-inline'; img-src 'self' data:; font-src https://unpkg.com; connect-src 'self' https://unpkg.com; frame-ancestors 'self'`,
        "x-frame-options": "SAMEORIGIN",
        "x-content-type-options": "nosniff",
        "referrer-policy": "same-origin"
      }
    });
  }
  return createApiResponse(SPEC, { cacheControl: "no-store" });
}

export async function onRequestOptions() {
  return handleCorsOptions();
}
