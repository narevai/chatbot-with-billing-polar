import { JSONObject, LanguageModelV3, LanguageModelV3Usage, SharedV3ProviderMetadata, LanguageModelV3Middleware } from '@ai-sdk/provider';

type Destination<TTags extends DefaultTags = DefaultTags> = (event: BillingEvent<TTags>) => Promise<void> | void;

interface Usage {
    readonly subProvider?: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens?: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
    readonly requestCount?: number;
    readonly webSearchCount?: number;
    readonly rawProviderCost?: number;
    readonly rawUpstreamInferenceCost?: number;
}
interface BillingEvent<TTags extends DefaultTags = DefaultTags> {
    readonly generationId: string;
    readonly modelId: string;
    readonly provider: string;
    readonly usage: Usage;
    readonly cost?: Cost;
    readonly tags: TTags;
}
type EventBuilder<TPayload, TTags extends DefaultTags = DefaultTags> = (payload: TPayload) => Promise<BillingEvent<TTags> | null> | BillingEvent<TTags> | null;

type DefaultTags = JSONObject;
interface BaseBillingMiddlewareOptions<TTags extends JSONObject = DefaultTags> {
    /** One or more billing destinations that receive each emitted {@link BillingEvent}. */
    destinations?: Destination<TTags>[];
    /** Tags merged into every emitted event. */
    defaultTags?: TTags;
    /**
     * Edge-runtime hook (e.g. `ctx.waitUntil`) used to keep the process alive
     * while billing events are flushed asynchronously.
     */
    waitUntil?: (promise: Promise<unknown>) => void;
    /** Called when an error occurs during event extraction or dispatch. Defaults to a silent no-op. */
    onError?: (error: unknown) => void;
}

type CostUnit = 'base' | 'cents' | 'micros' | 'nanos';
interface Cost {
    readonly amount: number;
    readonly currency: string;
    readonly unit: CostUnit;
}

/**
 * Token usage passed into a provider cost calculation function.
 */
interface CostInputs {
    /** Number of prompt (input) tokens. */
    promptTokens: number;
    /** Number of completion (output) tokens. */
    completionTokens: number;
    /** Number of tokens served from the prompt cache. */
    cacheReadTokens: number;
    /** Number of tokens written to the prompt cache. */
    cacheWriteTokens: number;
    /**
     * Number of reasoning tokens (priced with `internalReasoningTokens` when present in `ModelPricing`,
     * otherwise at the completion rate).
     */
    reasoningTokens: number;
    /** Number of web search calls (each billed at `pricing.webSearch` when set). */
    webSearchCount?: number;
}

interface ModelPricing {
    promptTokens: number;
    completionTokens: number;
    inputCacheReadTokens?: number;
    inputCacheWriteTokens?: number;
    internalReasoningTokens?: number;
    request?: number;
    webSearch?: number;
    discount?: number;
}
type PriceResolverContext = {
    modelId: string;
    providerId?: string;
    subProvider?: string;
    quantization?: string;
};
type PriceResolver = (context: PriceResolverContext) => Promise<ModelPricing | undefined>;

interface MeterMetadata {
    generation_id: string;
    model_id: string;
    provider: string;
    sub_provider?: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    reasoning_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
    request_count?: number;
    web_search_count?: number;
    raw_provider_cost?: number;
    raw_upstream_inference_cost?: number;
    [key: string]: string | number | undefined;
}

interface BuildV3EventPayload<TTags extends DefaultTags = DefaultTags> {
    responseId: string | undefined;
    model: LanguageModelV3;
    usage: LanguageModelV3Usage | undefined;
    providerMetadata: SharedV3ProviderMetadata | undefined;
    tags: TTags;
    webSearchCount: number;
}
/**
 * Configuration for {@link createV3BillingMiddleware}.
 *
 * Extends {@link BaseBillingMiddlewareOptions} (`destinations`, `defaultTags`, `waitUntil`, `onError`) and
 * requires an {@link EventBuilder} to construct the {@link BillingEvent}.
 *
 * @typeParam TTags - The shape of the tags object, extending {@link DefaultTags}.
 */
interface BillingMiddlewareV3Options<TTags extends DefaultTags = DefaultTags> extends BaseBillingMiddlewareOptions<TTags> {
    /** Builds a billing event from the model response data. */
    buildEvent: EventBuilder<BuildV3EventPayload<TTags>, TTags>;
}
/**
 * Creates a billing middleware for the Language Model V3 API.
 *
 * @typeParam TTags - The shape of the tags object, extending {@link DefaultTags}.
 * @param options - Billing options; see {@link BillingMiddlewareV3Options}.
 * @returns The billing middleware.
 */
declare function createV3BillingMiddleware<TTags extends DefaultTags = DefaultTags>(options: BillingMiddlewareV3Options<TTags>): LanguageModelV3Middleware;

/**
 * Creates a destination wrapper that normalizes destination handler errors.
 *
 * @param destinationId - Unique identifier for the destination.
 * @param handler - Destination implementation invoked for each billing event.
 * @returns A destination function that wraps thrown errors as AiBillingDestinationError.
 */
declare function createDestination<TTags extends DefaultTags = DefaultTags>(destinationId: string, handler: (event: BillingEvent<TTags>) => Promise<void> | void): Destination<TTags>;

/**
 * Creates a destination that logs billing events to the console.
 *
 * @returns A destination that prints each event with full depth formatting.
 */
declare function consoleDestination<TTags extends DefaultTags = DefaultTags>(): Destination<TTags>;

declare const symbol$3: unique symbol;
/** Base error type for all ai-billing package errors. */
declare class AIBillingError extends Error {
    private readonly [symbol$3];
    readonly cause?: unknown;
    constructor({ name, message, cause, }: {
        name: string;
        message: string;
        cause?: unknown;
    });
    static isInstance(error: unknown): error is AIBillingError;
    protected static hasMarker(error: unknown, markerString: string): boolean;
}

declare const symbol$2: unique symbol;
/** Error thrown when billing data extraction fails. */
declare class AiBillingExtractorError extends AIBillingError {
    private readonly [symbol$2];
    constructor({ message, cause, }: {
        message?: string;
        cause?: unknown;
    });
    static isInstance(error: unknown): error is AiBillingExtractorError;
}

declare const symbol$1: unique symbol;
/**
 * Error raised when billing data processing fails for a destination.
 */
declare class AiBillingDestinationError extends AIBillingError {
    private readonly [symbol$1];
    /** The ID of the destination that failed to process billing data. */
    readonly destinationId?: string;
    constructor({ destinationId, message, cause, }: {
        destinationId?: string;
        message?: string;
        cause?: unknown;
    });
    static isInstance(error: unknown): error is AiBillingDestinationError;
}

declare const symbol: unique symbol;
/** Error thrown when a cost conversion or calculation fails. */
declare class AiBillingCostError extends AIBillingError {
    private readonly [symbol];
    constructor({ message, cause }: {
        message: string;
        cause?: unknown;
    });
    static isInstance(error: unknown): error is AiBillingCostError;
}

/**
 * Returns the numeric amount of `cost` expressed in `targetUnit`.
 *
 * Values are converted via an integer nanos intermediate so fractional `base` / `cents` / `micros` amounts
 * round consistently. Throws {@link AiBillingCostError} when `cost.unit` is not a known {@link CostUnit}.
 *
 * @param cost - Source {@link Cost} (amount + unit + currency).
 * @param targetUnit - Unit for the returned number (same scale as {@link Cost} amounts for that unit).
 * @returns The amount in `targetUnit`; for `nanos` this is a whole number of nanos.
 * @internal
 */
declare const costToNumber: (cost: Cost, targetUnit: CostUnit) => number;
/**
 * Converts a {@link Cost} to the same amount in a different {@link CostUnit}, preserving `currency`.
 *
 * Implemented with {@link costToNumber}; the result is always a new object.
 *
 * @param cost - Source cost.
 * @param targetUnit - Desired unit for `amount` on the returned object.
 * @returns A new {@link Cost} with `unit: targetUnit` and `amount` in that unit's scale.
 * @internal
 */
declare const convertCostUnit: (cost: Cost, targetUnit: CostUnit) => Cost;
/**
 * Wraps a numeric rate as a {@link Cost} in `base` units and `USD` currency.
 *
 * Provider calculators pass per-token prices from {@link ModelPricing} here, then scale with
 * {@link multiplyCost} using token counts.
 *
 * @param amount - Rate amount in base USD units (defaults to `0` when omitted).
 * @returns A {@link Cost} with `unit: 'base'` and `currency: 'USD'`.
 * @internal
 */
declare const rateToCost: (amount?: number) => Cost;

/**
 * Scales a {@link Cost} by `multiplier` (for example token count × per-token rate).
 *
 * Converts to {@link CostUnit} `nanos`, multiplies the integer nanos amount (rounded), and returns a
 * {@link Cost} with `unit: 'nanos'` and the same `currency` as the input.
 *
 * @param cost - Base cost to scale.
 * @param multiplier - Factor applied to the nanos amount (often a non-negative token count).
 * @returns The scaled cost in nanos.
 * @internal
 */
declare const multiplyCost: (cost: Cost, multiplier: number) => Cost;
/**
 * Adds any number of {@link Cost} values after converting each to nanos.
 *
 * All arguments must share the same `currency`; otherwise throws {@link AiBillingCostError}. With no
 * arguments, returns a zero USD cost in nanos. With a single cost, still normalizes to nanos.
 *
 * @param costs - Costs to sum (variadic).
 * @returns The total as a {@link Cost} with `unit: 'nanos'` and the shared `currency`.
 * @internal
 */
declare const addCosts: (...costs: Cost[]) => Cost;
/**
 * Applies a fractional discount to `cost` in nanos: `amount * (1 - discount)`.
 *
 * If `discount` is falsy or `<= 0`, returns `cost` unchanged (same unit and amount). Otherwise converts to
 * nanos, subtracts `round(amount * discount)`, and clamps the result at zero. Typical `discount` values are
 * between `0` and `1` (for example `0.1` for 10% off).
 *
 * @param cost - Original cost.
 * @param discount - Fraction of the nanos amount to remove (not a percentage label).
 * @returns Either the original `cost` or a discounted {@link Cost} in nanos.
 * @internal
 */
declare const applyDiscount: (cost: Cost, discount: number) => Cost;

/**
 * Creates a base price resolver that wraps a handler function.
 * @param handler - The function that resolves model pricing.
 * @returns A price resolver that wraps the handler function.
 */
declare function createBasePriceResolver(handler: (context: PriceResolverContext) => ModelPricing | undefined | Promise<ModelPricing | undefined>): PriceResolver;

/**
 * Configuration for {@link createNarevPriceResolver}.
 */
type NarevPriceResolverOptions = {
    /** API key used for authenticated pricing requests. */
    apiKey: string;
    /** Optional base URL for the Narev API. */
    apiUrl?: string;
};
/**
 * Creates a price resolver that fetches model pricing from the Narev API.
 *
 * @param options - Resolver options; see {@link NarevPriceResolverOptions}.
 * @returns A base price resolver that resolves model pricing from Narev.
 */
declare function createNarevPriceResolver(options: NarevPriceResolverOptions): PriceResolver;

/**
 * Creates a price resolver that uses a static pricing map.
 * @param pricingMap - A mapping of model IDs to model pricing.
 * @returns A price resolver that uses the static pricing map.
 */
declare function createObjectPriceResolver(pricingMap: Record<string, ModelPricing>): PriceResolver;

/**
 * Casts a billing event into a JSON object payload.
 * @param event - The billing event to cast.
 * @returns The billing event represented as a JSON object.
 */
declare function toJSONObject(event: BillingEvent<DefaultTags>): JSONObject;

/**
 * Converts a billing event into a meter metadata object.
 * @param event - The billing event to convert.
 * @returns The meter metadata object.
 */
declare function buildMeterMetadata<TTags extends DefaultTags = DefaultTags>(event: BillingEvent<TTags>): MeterMetadata;

/** Maps {@link CostInputs} token counts to a {@link Usage} object. */
declare function toUsage(inputs: CostInputs): Usage;

export { AIBillingError, AiBillingCostError, AiBillingDestinationError, AiBillingExtractorError, type BaseBillingMiddlewareOptions, type BillingEvent, type BillingMiddlewareV3Options, type BuildV3EventPayload, type Cost, type CostInputs, type CostUnit, type DefaultTags, type Destination, type EventBuilder, type MeterMetadata, type ModelPricing, type NarevPriceResolverOptions, type PriceResolver, type PriceResolverContext, type Usage, addCosts, applyDiscount, buildMeterMetadata, consoleDestination, convertCostUnit, costToNumber, createBasePriceResolver, createDestination, createNarevPriceResolver, createObjectPriceResolver, createV3BillingMiddleware, multiplyCost, rateToCost, toJSONObject, toUsage };
