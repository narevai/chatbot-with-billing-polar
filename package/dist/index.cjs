"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name4 in all)
    __defProp(target, name4, { get: all[name4], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AIBillingError: () => AIBillingError,
  AiBillingCostError: () => AiBillingCostError,
  AiBillingDestinationError: () => AiBillingDestinationError,
  AiBillingExtractorError: () => AiBillingExtractorError,
  addCosts: () => addCosts,
  applyDiscount: () => applyDiscount,
  buildMeterMetadata: () => buildMeterMetadata,
  consoleDestination: () => consoleDestination,
  convertCostUnit: () => convertCostUnit,
  costToNumber: () => costToNumber,
  createBasePriceResolver: () => createBasePriceResolver,
  createDestination: () => createDestination,
  createNarevPriceResolver: () => createNarevPriceResolver,
  createObjectPriceResolver: () => createObjectPriceResolver,
  createV3BillingMiddleware: () => createV3BillingMiddleware,
  multiplyCost: () => multiplyCost,
  rateToCost: () => rateToCost,
  toJSONObject: () => toJSONObject,
  toUsage: () => toUsage
});
module.exports = __toCommonJS(index_exports);

// src/event/to-json-object.ts
function toJSONObject(event) {
  return event;
}

// src/event/to-meter-metadata.ts
function buildMeterMetadata(event) {
  const u = event.usage ?? {};
  const dimensions = {
    generation_id: event.generationId,
    model_id: event.modelId,
    provider: event.provider
  };
  const addOptional = (key, value) => {
    if (value !== void 0 && value !== null) {
      dimensions[key] = value;
    }
  };
  addOptional("sub_provider", u.subProvider);
  addOptional("input_tokens", u.inputTokens);
  addOptional("output_tokens", u.outputTokens);
  addOptional("reasoning_tokens", u.reasoningTokens);
  addOptional("cache_read_tokens", u.cacheReadTokens);
  addOptional("cache_write_tokens", u.cacheWriteTokens);
  addOptional("request_count", u.requestCount);
  addOptional("web_search_count", u.webSearchCount);
  addOptional("raw_provider_cost", u.rawProviderCost);
  addOptional("raw_upstream_inference_cost", u.rawUpstreamInferenceCost);
  if (event.tags) {
    for (const [key, value] of Object.entries(event.tags)) {
      if (value == null) continue;
      dimensions[`tag_${key}`] = typeof value === "object" ? JSON.stringify(value) : value;
    }
  }
  return dimensions;
}

// src/ai-sdk/language-model-middleware/v3/language-model-v3-base-billing-middleware.ts
function createV3BillingMiddleware(options) {
  const { buildEvent, destinations, defaultTags, waitUntil, onError } = options;
  const processEvent = async ({
    model,
    params,
    usage,
    providerMetadata,
    responseId,
    webSearchCount
  }) => {
    try {
      const requestTags = params.providerOptions?.["ai-billing-tags"];
      const tags = {
        ...defaultTags ?? {},
        ...requestTags ?? {}
      };
      const event = await buildEvent({
        responseId,
        model,
        usage,
        providerMetadata,
        tags,
        webSearchCount
      });
      if (event && destinations && destinations?.length > 0) {
        const dispatchDestinationsPromise = Promise.allSettled(
          destinations.map((d) => Promise.resolve(d(event)))
        );
        if (waitUntil) waitUntil(dispatchDestinationsPromise);
      }
      return event;
    } catch (err) {
      if (onError) onError(err);
      else console.error("[ai-billing] Core Error:", err);
      return null;
    }
  };
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate, model, params }) => {
      const result = await doGenerate();
      const webSearchCount = result.content.filter(
        (c) => c.type === "source"
      ).length;
      const event = await processEvent({
        model,
        params,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
        responseId: result.response?.id,
        webSearchCount
      });
      const providerMetadataWithBilling = {
        ...result.providerMetadata
      };
      if (event) {
        providerMetadataWithBilling["ai-billing"] = toJSONObject(event);
      }
      return {
        ...result,
        providerMetadata: providerMetadataWithBilling
      };
    },
    wrapStream: async ({ doStream, model, params }) => {
      const { stream, ...rest } = await doStream();
      let responseId;
      let usage;
      let providerMetadata;
      let finishChunk;
      let webSearchCount = 0;
      const billedStream = stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (chunk.type === "text-start") responseId = chunk.id;
            if (chunk.type === "response-metadata" && !responseId) {
              responseId = chunk.id;
            }
            if (chunk.type === "source") {
              webSearchCount++;
            }
            if (chunk.type === "finish") {
              usage = chunk.usage;
              providerMetadata = chunk.providerMetadata;
              finishChunk = chunk;
              return;
            }
            controller.enqueue(chunk);
          },
          async flush(controller) {
            const event = await processEvent({
              model,
              params,
              usage,
              providerMetadata,
              responseId,
              webSearchCount
            });
            const providerMetadataWithBilling = {
              ...providerMetadata
            };
            if (event) {
              providerMetadataWithBilling["ai-billing"] = toJSONObject(event);
            }
            if (finishChunk) {
              controller.enqueue({
                ...finishChunk,
                providerMetadata: providerMetadataWithBilling
              });
            }
          }
        })
      );
      return { ...rest, stream: billedStream };
    }
  };
}

// src/error/ai-billing-error.ts
var marker = "ai-billing.error";
var symbol = Symbol.for(marker);
var AIBillingError = class _AIBillingError extends Error {
  [symbol] = true;
  cause;
  constructor({
    name: name4,
    message,
    cause
  }) {
    super(message);
    this.name = name4;
    this.cause = cause;
  }
  static isInstance(error) {
    return _AIBillingError.hasMarker(error, marker);
  }
  static hasMarker(error, markerString) {
    const markerSymbol = Symbol.for(markerString);
    return error != null && typeof error === "object" && markerSymbol in error && typeof error[markerSymbol] === "boolean" && error[markerSymbol] === true;
  }
};

// src/error/extractor-error.ts
var name = "AiBillingExtractorError";
var marker2 = `ai-billing.error.${name}`;
var symbol2 = Symbol.for(marker2);
var AiBillingExtractorError = class extends AIBillingError {
  [symbol2] = true;
  constructor({
    message = `Failed to extract billing data.`,
    cause
  }) {
    super({ name, message, cause });
  }
  static isInstance(error) {
    return AIBillingError.hasMarker(error, marker2);
  }
};

// src/error/destination-error.ts
var name2 = "AiBillingDestinationError";
var marker3 = `ai-billing.error.${name2}`;
var symbol3 = Symbol.for(marker3);
var AiBillingDestinationError = class extends AIBillingError {
  [symbol3] = true;
  /** The ID of the destination that failed to process billing data. */
  destinationId;
  constructor({
    destinationId,
    message = `Failed to process billing data for destination: '${destinationId}'.`,
    cause
  }) {
    super({ name: name2, message, cause });
    this.destinationId = destinationId;
  }
  static isInstance(error) {
    return AIBillingError.hasMarker(error, marker3);
  }
};

// src/error/cost-error.ts
var name3 = "AiBillingCostError";
var marker4 = `ai-billing.error.${name3}`;
var symbol4 = Symbol.for(marker4);
var AiBillingCostError = class extends AIBillingError {
  [symbol4] = true;
  constructor({ message, cause }) {
    super({ name: name3, message, cause });
  }
  static isInstance(error) {
    return AIBillingError.hasMarker(error, marker4);
  }
};

// src/destination/base-destination.ts
function createDestination(destinationId, handler) {
  return async (event) => {
    try {
      await handler(event);
    } catch (error) {
      throw new AiBillingDestinationError({
        destinationId,
        cause: error
      });
    }
  };
}

// src/destination/console-destination.ts
function consoleDestination() {
  return createDestination("console-logger", (event) => {
    console.dir(event, {
      depth: null,
      colors: true,
      compact: false
    });
  });
}

// src/cost/convert-cost.ts
var getNanos = (cost) => {
  switch (cost.unit) {
    case "base":
      return Math.round(cost.amount * 1e9);
    case "cents":
      return Math.round(cost.amount * 1e7);
    case "micros":
      return Math.round(cost.amount * 1e3);
    case "nanos":
      return Math.round(cost.amount);
    default:
      throw new AiBillingCostError({
        message: `Failed to process cost. Unknown CostUnit: '${String(cost.unit)}'.`
      });
  }
};
var costToNumber = (cost, targetUnit) => {
  const nanos = getNanos(cost);
  if (targetUnit === "nanos") return nanos;
  if (targetUnit === "micros") return nanos / 1e3;
  if (targetUnit === "cents") return nanos / 1e7;
  return nanos / 1e9;
};
var convertCostUnit = (cost, targetUnit) => {
  return {
    amount: costToNumber(cost, targetUnit),
    currency: cost.currency,
    unit: targetUnit
  };
};
var rateToCost = (amount = 0) => ({
  amount,
  unit: "base",
  currency: "USD"
});

// src/cost/op-cost.ts
var multiplyCost = (cost, multiplier) => {
  const nanosCost = convertCostUnit(cost, "nanos");
  return {
    ...nanosCost,
    amount: Math.round(nanosCost.amount * multiplier)
  };
};
var addCosts = (...costs) => {
  if (costs.length === 0) {
    return { amount: 0, unit: "nanos", currency: "USD" };
  }
  const firstCost = costs[0];
  if (!firstCost) {
    return { amount: 0, unit: "nanos", currency: "USD" };
  }
  const baseCurrency = firstCost.currency;
  const totalNanos = costs.reduce((sum, currentCost) => {
    if (currentCost.currency !== baseCurrency) {
      throw new AiBillingCostError({
        message: `Currency mismatch: Cannot add ${baseCurrency} to ${currentCost.currency}`
      });
    }
    return sum + convertCostUnit(currentCost, "nanos").amount;
  }, 0);
  return { amount: totalNanos, unit: "nanos", currency: baseCurrency };
};
var applyDiscount = (cost, discount) => {
  if (!discount || discount <= 0) return cost;
  const nanosCost = convertCostUnit(cost, "nanos");
  const discountAmount = Math.round(nanosCost.amount * discount);
  return {
    ...nanosCost,
    amount: Math.max(0, nanosCost.amount - discountAmount)
  };
};

// src/pricing/base-price-resolver.ts
function createBasePriceResolver(handler) {
  return async (context) => {
    return handler(context);
  };
}

// src/pricing/narev-price-resolver.ts
function pricingDataToModelPricing(p) {
  return {
    promptTokens: p.price_prompt,
    completionTokens: p.price_completion,
    request: p.pricing_request || void 0,
    inputCacheReadTokens: p.price_input_cache_read || void 0,
    inputCacheWriteTokens: p.price_input_cache_write || void 0,
    internalReasoningTokens: p.price_internal_reasoning || void 0,
    discount: p.pricing_discount || void 0
  };
}
function createNarevPriceResolver(options) {
  const { apiKey, apiUrl = "https://narev.ai" } = options;
  return createBasePriceResolver(
    async ({
      modelId,
      providerId,
      subProvider
    }) => {
      const params = new URLSearchParams({ model_id: modelId });
      if (providerId) params.set("provider", providerId);
      if (subProvider) params.set("subprovider", subProvider);
      const url = `${apiUrl}/api/models/pricing?${params}`;
      const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      let response;
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return void 0;
        response = await res.json();
      } catch {
        return void 0;
      }
      if (!response) return void 0;
      const entry = response.data.find((e) => e.model_id === modelId);
      if (!entry?.pricing) return void 0;
      return pricingDataToModelPricing(entry.pricing);
    }
  );
}

// src/pricing/object-price-resolver.ts
function createObjectPriceResolver(pricingMap) {
  return createBasePriceResolver(({ modelId }) => {
    return pricingMap[modelId];
  });
}

// src/utils/to-usage.ts
function toUsage(inputs) {
  return {
    inputTokens: inputs.promptTokens,
    outputTokens: inputs.completionTokens,
    cacheReadTokens: inputs.cacheReadTokens,
    cacheWriteTokens: inputs.cacheWriteTokens,
    reasoningTokens: inputs.reasoningTokens,
    webSearchCount: inputs.webSearchCount
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AIBillingError,
  AiBillingCostError,
  AiBillingDestinationError,
  AiBillingExtractorError,
  addCosts,
  applyDiscount,
  buildMeterMetadata,
  consoleDestination,
  convertCostUnit,
  costToNumber,
  createBasePriceResolver,
  createDestination,
  createNarevPriceResolver,
  createObjectPriceResolver,
  createV3BillingMiddleware,
  multiplyCost,
  rateToCost,
  toJSONObject,
  toUsage
});
//# sourceMappingURL=index.cjs.map