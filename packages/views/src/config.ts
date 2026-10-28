/**
 * Zod mirror of `configs/schema.json` (the GuitarGame ruleset schema), the
 * semantic checks the schema's `$comment` requires, a loader and the bundled
 * default ruleset.
 *
 * `configs/schema.json` is the source of truth. Every `$defs` entry has a
 * schema here with the same name in camelCase plus the suffix `Schema`.
 * `tests/__tests__/newConfig.test.ts` runs an Ajv-vs-Zod differential test so
 * the two cannot drift apart.
 */
import { z } from "zod";
import defaultRulesetData from "../configs/default.ruleset.json" with { type: "json" };
import {
  type RulesetIssue,
  validateRulesetSemantics,
} from "./ruleset/semantics.js";

export type { RulesetIssue } from "./ruleset/semantics.js";
export { validateRulesetSemantics } from "./ruleset/semantics.js";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** JSON Schema `uniqueItems: true` for arrays of primitives. */
function unique<T extends z.ZodType<unknown[]>>(schema: T) {
  return schema.refine(
    (items) => new Set(items as unknown[]).size === (items as unknown[]).length,
    { message: "Items must be unique" },
  );
}

/** `["boolean","integer","number","string"]` in the JSON Schema. */
const primitive = z.union([z.boolean(), z.number(), z.string()]);

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

export const identifierSchema = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]*$/, "Must be a camelCase identifier");
export const pitchSchema = z.number().int().min(0).max(127);
export const velocitySchema = z.number().int().min(1).max(127);
export const pitchRangeSchema = z.strictObject({
  from: pitchSchema,
  to: pitchSchema,
});
export const pitchSetSchema = z.union([
  unique(z.array(pitchSchema).min(1)),
  pitchRangeSchema,
]);
export const velocityRangeSchema = z.strictObject({
  min: velocitySchema,
  max: velocitySchema,
});
export const severitySchema = z.enum(["error", "warning", "info", "ignore"]);
export const statusSchema = z.enum(["stable", "provisional", "todo"]);
export const difficultyNameSchema = z.enum([
  "easy",
  "medium",
  "hard",
  "expert",
]);
export const difficultySetSchema = z.union([
  z.literal("all"),
  unique(z.array(difficultyNameSchema).min(1)),
]);
export const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const trackNameSchema = z.string().min(1);
export const trackNamesSchema = unique(z.array(trackNameSchema).min(1));
export const descriptionSchema = z.string();

/* -------------------------------------------------------------------------- */
/* Profile / midi / grammar / policies                                        */
/* -------------------------------------------------------------------------- */

export const profileSchema = z.strictObject({
  id: identifierSchema,
  name: z.string(),
  targetGame: z.string(),
  specVersion: z.string().optional(),
  description: descriptionSchema.optional(),
});

export const detectionSchema = z.strictObject({
  requiredTracks: unique(z.array(trackNameSchema)).optional(),
  forbiddenTracks: unique(z.array(trackNameSchema)).optional(),
  description: descriptionSchema.optional(),
});

export const midiConfigSchema = z.strictObject({
  fileFormat: z.literal(1),
  timeDivision: z.literal("ticksPerQuarter"),
  recommendedResolution: z.number().int().min(1).optional(),
  trackNameEvent: z
    .strictObject({
      mustBeFirstEvent: z.boolean().optional(),
      mustBeAtTickZero: z.boolean().optional(),
    })
    .optional(),
  noteDefaults: z.strictObject({
    endTickInclusive: z.boolean(),
    allowZeroLength: z.boolean(),
    zeroLengthSeverity: severitySchema.optional(),
  }),
  conventions: z
    .strictObject({
      channel: z.number().int().min(0).max(15).optional(),
      nominalVelocity: velocitySchema.optional(),
      severity: severitySchema.optional(),
    })
    .optional(),
  tempoMap: z
    .strictObject({
      timeSignatureMustAlignToMeasure: z.boolean().optional(),
      severity: severitySchema.optional(),
    })
    .optional(),
});

export const textEventGrammarSchema = z.strictObject({
  metaEventTypes: unique(z.array(z.number().int().min(1).max(15)).min(1)),
  encoding: z.enum(["utf-8", "any"]).optional(),
  brackets: z.enum(["required", "optional"]),
  componentSyntax: z.enum(["freeform", "structured"]),
  allowUnderscoreAsSpace: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  stringEscapes: unique(z.array(z.string())).optional(),
});

export const policiesSchema = z.strictObject({
  unknownTrack: severitySchema,
  unknownPitch: severitySchema,
  reservedPitch: severitySchema.optional(),
  unknownTextEvent: severitySchema,
  unknownSysex: severitySchema.optional(),
  vocabularyMismatch: severitySchema.optional(),
});

export const settingsSourceSchema = z.strictObject({
  id: identifierSchema,
  file: z.string(),
  keys: z.array(
    z.strictObject({
      name: z.string(),
      type: z.enum(["boolean", "integer", "number", "string"]),
      unit: z.enum(["ticks", "seconds", "none"]).optional(),
      allowedValues: z.array(primitive).optional(),
      default: primitive.optional(),
      description: descriptionSchema.optional(),
    }),
  ),
});

export const playerOptionSchema = z.strictObject({
  id: identifierSchema,
  description: descriptionSchema.optional(),
});

export const vocabularySchema = z.strictObject({
  values: unique(z.array(z.string())),
  enforce: z.boolean(),
  source: z.string().optional(),
  description: descriptionSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Threshold                                                                  */
/* -------------------------------------------------------------------------- */

const thresholdValueSchema = z.discriminatedUnion("unit", [
  z.strictObject({
    unit: z.literal("step"),
    denominator: z.number().int().min(1),
  }),
  z.strictObject({
    unit: z.literal("ticks"),
    ticks: z.number().int().min(0),
  }),
  z.strictObject({
    unit: z.literal("resolutionFormula"),
    divisor: z.number().gt(0),
    addTicks: z.number().int(),
    rounding: z.enum(["floor", "round", "ceil"]),
  }),
  z.strictObject({
    unit: z.literal("seconds"),
    seconds: z.number().min(0),
  }),
]);

export const thresholdSchema = z.strictObject({
  value: thresholdValueSchema,
  inclusive: z.boolean().optional(),
  maxTicks: z.number().int().min(0).optional(),
  overrides: z
    .array(
      z.strictObject({
        source: identifierSchema,
        key: z.string(),
        description: descriptionSchema.optional(),
      }),
    )
    .optional(),
  description: descriptionSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Condition (recursive)                                                      */
/* -------------------------------------------------------------------------- */

export type Condition =
  | {
      textEvent: string;
      track?: string | undefined;
      relation?: "present" | "before" | "after" | undefined;
    }
  | {
      setting: {
        source: string;
        key: string;
        equals?: boolean | number | string | undefined;
        present?: boolean | undefined;
      };
    }
  | { playerOption: string }
  | { variant: string }
  | { phraseAbsent: string }
  | { allOf: Condition[] }
  | { anyOf: Condition[] }
  | { not: Condition };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({
      textEvent: identifierSchema,
      track: z.string().optional(),
      relation: z.enum(["present", "before", "after"]).optional(),
    }),
    z.strictObject({
      setting: z.strictObject({
        source: identifierSchema,
        key: z.string(),
        equals: primitive.optional(),
        present: z.boolean().optional(),
      }),
    }),
    z.strictObject({ playerOption: identifierSchema }),
    z.strictObject({ variant: identifierSchema }),
    z.strictObject({ phraseAbsent: identifierSchema }),
    z.strictObject({ allOf: z.array(conditionSchema).min(1) }),
    z.strictObject({ anyOf: z.array(conditionSchema).min(1) }),
    z.strictObject({ not: conditionSchema }),
  ]),
) as z.ZodType<Condition>;

/* -------------------------------------------------------------------------- */
/* Lanes, notes, markers, modifiers                                           */
/* -------------------------------------------------------------------------- */

export const sysexMatcherSchema = z.strictObject({
  format: z.literal("phaseShift"),
  modifierCode: z.number().int().min(0).max(255),
  difficultyBytes: unique(
    z
      .array(
        z.union([
          z.literal(0),
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(255),
        ]),
      )
      .min(1),
  ),
});

export const modifierSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("note"), pitch: pitchSchema }),
  z.strictObject({ kind: z.literal("sysex"), sysex: sysexMatcherSchema }),
  z.strictObject({ kind: z.literal("velocity"), velocity: velocitySchema }),
]);

export const padTypeSchema = z.enum(["tom", "cymbal"]);

export const laneDefSchema = z.strictObject({
  id: identifierSchema,
  index: z.number().int().min(0),
  displayName: z.string(),
  color: colorSchema.optional(),
  shape: z.enum(["gem", "openBar", "pad", "kickBar"]).optional(),
  padTypes: unique(z.array(padTypeSchema).min(1)).optional(),
  defaultPadType: padTypeSchema.optional(),
  onlyOnTracks: trackNamesSchema.optional(),
  whenDisabled: severitySchema.optional(),
  description: descriptionSchema.optional(),
});

export const difficultyNoteSchema = z.strictObject({
  pitch: pitchSchema,
  lane: identifierSchema,
  padType: padTypeSchema.optional(),
  enabledWhen: conditionSchema.optional(),
  whenDisabled: severitySchema.optional(),
  description: descriptionSchema.optional(),
});

export const markerEffectSchema = z.enum([
  "forceHopo",
  "forceStrum",
  "forceTap",
  "flam",
]);

export const difficultyMarkerSchema = z.strictObject({
  pitch: pitchSchema,
  effect: markerEffectSchema,
  scope: z.enum(["sameTick", "span"]).optional(),
  includesEndTick: z.boolean().optional(),
  status: statusSchema.optional(),
  description: descriptionSchema.optional(),
});

export const difficultyBlockSchema = z.strictObject({
  notes: z.array(difficultyNoteSchema).min(1),
  markers: z.array(difficultyMarkerSchema).optional(),
  reserved: z.array(pitchRangeSchema).optional(),
  description: descriptionSchema.optional(),
});

/**
 * Zod 4 `z.record` with an enum key is exhaustive, so this is a partial
 * record that additionally requires at least one key (`minProperties: 1`).
 */
export const difficultiesSchema = z
  .partialRecord(difficultyNameSchema, difficultyBlockSchema)
  .refine((d) => Object.keys(d).length >= 1, {
    message: "At least one difficulty is required",
  });

export const modifierDefSchema = z.strictObject({
  id: identifierSchema,
  effect: z.enum([
    "forceHopo",
    "forceStrum",
    "forceTap",
    "open",
    "setPadType",
    "flam",
    "accent",
    "ghost",
  ]),
  padType: padTypeSchema.optional(),
  source: modifierSourceSchema,
  scope: z.enum(["sameTick", "span"]).optional(),
  includesEndTick: z.boolean().optional(),
  appliesTo: difficultySetSchema.optional(),
  appliesToLanes: unique(z.array(identifierSchema)).optional(),
  excludeLanes: unique(z.array(identifierSchema)).optional(),
  enabledWhen: conditionSchema.optional(),
  status: statusSchema.optional(),
  description: descriptionSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Phrases, event notes, text events                                          */
/* -------------------------------------------------------------------------- */

export const phraseEffectSchema = z.enum([
  "starPower",
  "starPowerActivation",
  "solo",
  "trill",
  "tremolo",
  "singleLaneRoll",
  "doubleLaneRoll",
  "drumFill",
  "bigRockEnding",
  "versusPlayer1",
  "versusPlayer2",
  "lyricPhrase",
  "lyricPhraseSecondary",
  "powerWindow",
  "discoFlip",
]);

export const phraseDefSchema = z.strictObject({
  id: identifierSchema,
  effect: phraseEffectSchema,
  pitches: unique(z.array(pitchSchema).min(1)),
  pitchRequirement: z.enum(["any", "all"]).optional(),
  appliesTo: difficultySetSchema.optional(),
  velocityRules: z
    .array(
      z.strictObject({
        velocity: velocityRangeSchema,
        appliesTo: difficultySetSchema,
      }),
    )
    .optional(),
  includesEndTick: z.boolean().optional(),
  enabledWhen: conditionSchema.optional(),
  requires: conditionSchema.optional(),
  alsoActsAs: z
    .strictObject({
      effect: z.literal("starPower"),
      when: conditionSchema,
    })
    .optional(),
  sharesPitchesWith: unique(z.array(identifierSchema)).optional(),
  mustContainNotes: z.boolean().optional(),
  requiresNoteAfter: z.boolean().optional(),
  maxDistinctLanes: z.number().int().min(1).optional(),
  activation: z
    .strictObject({
      target: z.literal("nearestNoteToEnd"),
      window: thresholdSchema,
      includeNotesOutsidePhrase: z.boolean().optional(),
      lengthMeaning: z.enum(["indicatorLength", "none"]).optional(),
    })
    .optional(),
  status: statusSchema.optional(),
  description: descriptionSchema.optional(),
});

export const eventNoteDefSchema = z.strictObject({
  id: identifierSchema,
  category: z.enum([
    "handPosition",
    "animation",
    "performerFocus",
    "cameraCut",
    "spotlight",
    "singalong",
    "beatline",
    "vocalKey",
    "vocalRangeShift",
    "vocalLyricShift",
    "practiceAssist",
    "other",
  ]),
  pitches: pitchSetSchema,
  valueLabels: z.array(z.string()).optional(),
  status: statusSchema.optional(),
  description: descriptionSchema.optional(),
});

export const textEventArgTypeSchema = z.enum([
  "identifier",
  "string",
  "number",
  "integer",
]);

export const textEventArgumentSchema = z.strictObject({
  name: identifierSchema,
  type: z.union([
    textEventArgTypeSchema,
    unique(z.array(textEventArgTypeSchema).min(1)),
  ]),
  enum: unique(z.array(z.union([z.string(), z.number()])).min(1)).optional(),
  vocabulary: identifierSchema.optional(),
  optional: z.boolean().optional(),
  variadic: z.boolean().optional(),
  default: z.union([z.string(), z.number()]).optional(),
  description: descriptionSchema.optional(),
});

const textEventShared = {
  placement: z.enum(["trackStart", "anywhere"]).optional(),
  honoredOnTracks: trackNamesSchema.optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  status: statusSchema.optional(),
  description: descriptionSchema.optional(),
};

export const textEventDefSchema = z.union([
  z.strictObject({
    id: identifierSchema,
    pattern: z.string(),
    captures: z
      .array(
        z.strictObject({
          name: identifierSchema,
          enum: z.array(z.string()).optional(),
          description: descriptionSchema.optional(),
        }),
      )
      .optional(),
    ...textEventShared,
  }),
  z.strictObject({
    id: identifierSchema,
    identifier: z.string().regex(/^[^ \]]+$/),
    arguments: z.array(textEventArgumentSchema).optional(),
    ...textEventShared,
  }),
]);

/* -------------------------------------------------------------------------- */
/* Constraints                                                                */
/* -------------------------------------------------------------------------- */

const constraintBase = {
  id: identifierSchema,
  severity: severitySchema,
  status: statusSchema.optional(),
  description: descriptionSchema.optional(),
};

export const constraintSchema = z.union([
  z.strictObject({
    ...constraintBase,
    rule: z.literal("forbiddenPitches"),
    pitches: pitchSetSchema,
  }),
  z.strictObject({
    ...constraintBase,
    rule: z.literal("mutuallyExclusiveAtTick"),
    members: unique(z.array(identifierSchema).min(2)),
  }),
  z.strictObject({
    ...constraintBase,
    rule: z.literal("notesWithinPhrase"),
    phrases: z.array(identifierSchema).min(1),
    noteClasses: z.array(identifierSchema).min(1),
  }),
  z.strictObject({
    ...constraintBase,
    rule: z.literal("noSustains"),
    threshold: thresholdSchema,
  }),
  z.strictObject({
    ...constraintBase,
    rule: z.literal("noOverlappingSamePitch"),
  }),
  z.strictObject({
    ...constraintBase,
    rule: z.literal("noOverlappingSameLane"),
  }),
  z.strictObject({
    ...constraintBase,
    rule: z.literal("monophonic"),
    noteClasses: z.array(identifierSchema).min(1),
  }),
  z.strictObject({
    ...constraintBase,
    rule: z.literal("phrasesMayNotOverlap"),
    phrases: unique(z.array(identifierSchema).min(2)),
  }),
  z.strictObject({
    ...constraintBase,
    rule: z.literal("phraseMustBeBetween"),
    phrase: identifierSchema,
    between: identifierSchema,
  }),
]);

/* -------------------------------------------------------------------------- */
/* Tracks                                                                     */
/* -------------------------------------------------------------------------- */

export const textEventListSchema = z.array(textEventDefSchema);
export const eventNoteListSchema = z.array(eventNoteDefSchema);
export const reservedListSchema = z.array(pitchRangeSchema);
export const constraintListSchema = z.array(constraintSchema);
export const pitchListSchema = unique(z.array(pitchSchema));

const trackCommon = {
  id: identifierSchema,
  trackNames: trackNamesSchema,
  required: z.boolean().optional(),
  position: z.number().int().min(1).optional(),
  description: descriptionSchema.optional(),
  textEvents: textEventListSchema.optional(),
  eventNotes: eventNoteListSchema.optional(),
  reserved: reservedListSchema.optional(),
  constraints: constraintListSchema.optional(),
  unknownPitchPolicy: severitySchema.optional(),
  ignoredPitches: pitchListSchema.optional(),
};

export const headerTrackSchema = z.strictObject({
  ...trackCommon,
  kind: z.literal("header"),
  versionCheck: z
    .strictObject({
      textEvent: identifierSchema,
      argument: identifierSchema,
      accepted: unique(z.array(z.string()).min(1)),
      compareAs: z.literal("string"),
      onMissing: severitySchema.optional(),
      onMismatch: severitySchema,
    })
    .optional(),
});

export const globalTrackSchema = z.strictObject({
  ...trackCommon,
  kind: z.literal("global"),
});

export const guitarMechanicsSchema = z.strictObject({
  hopoThreshold: thresholdSchema.optional(),
  autoHopoExclusions: unique(
    z.array(z.enum(["sameLaneAsPrevious", "chord"])),
  ).optional(),
  sustainCutoff: thresholdSchema.optional(),
  sustainGap: thresholdSchema.optional(),
  positionSnap: z
    .strictObject({
      enabled: z.boolean(),
      threshold: thresholdSchema.optional(),
      appliesToSustainEnds: z.boolean().optional(),
      description: descriptionSchema.optional(),
    })
    .optional(),
});

const laneTrackCommon = {
  ...trackCommon,
  lanes: z.array(laneDefSchema).min(1),
  difficulties: difficultiesSchema,
};

export const guitarTrackSchema = z.strictObject({
  ...laneTrackCommon,
  kind: z.literal("guitar"),
  modifiers: z.array(modifierDefSchema).optional(),
  phrases: z.array(phraseDefSchema).optional(),
  mechanics: guitarMechanicsSchema.optional(),
});

export const drumVariantsSchema = z.strictObject({
  supported: unique(z.array(identifierSchema).min(1)),
  authored: unique(z.array(identifierSchema).min(1)),
  detection: z
    .array(
      z.union([
        z.strictObject({ when: conditionSchema, result: identifierSchema }),
        z.strictObject({
          heuristic: z.enum(["tomMarkersPresent", "cymbalPitchesPresent"]),
          result: identifierSchema,
        }),
        z.strictObject({ default: identifierSchema }),
      ]),
    )
    .min(1),
  derivations: z
    .array(
      z.strictObject({
        variant: identifierSchema,
        from: identifierSchema,
        rule: z.literal("cymbalsToToms"),
        description: descriptionSchema.optional(),
      }),
    )
    .optional(),
  rejectWhen: conditionSchema.optional(),
});

export const drumsTrackSchema = z.strictObject({
  ...laneTrackCommon,
  kind: z.literal("drums"),
  modifiers: z.array(modifierDefSchema).optional(),
  phrases: z.array(phraseDefSchema).optional(),
  variants: drumVariantsSchema,
});

export const vocalNoteClassSchema = z.strictObject({
  id: identifierSchema,
  class: z.enum(["pitched", "pitchless", "percussion"]),
  pitches: pitchSetSchema,
  displayed: z.boolean().optional(),
  noteNaming: z
    .strictObject({
      scheme: z.literal("scientific"),
      c4Pitch: pitchSchema,
    })
    .optional(),
  description: descriptionSchema.optional(),
});

export const vocalsTrackSchema = z.strictObject({
  ...trackCommon,
  kind: z.literal("vocals"),
  difficultyModel: z.literal("shared"),
  noteClasses: z.array(vocalNoteClassSchema).min(1),
  phrases: z.array(phraseDefSchema).optional(),
  lyrics: z.strictObject({
    metaEventTypes: unique(z.array(z.number().int().min(1).max(15)).min(1)),
    encoding: z.enum(["utf-8", "any"]).optional(),
    alignment: z.enum(["mustMatchNoteStart", "pairedIfAligned"]),
    alignmentSeverity: severitySchema.optional(),
    allowLyricsOnlyChart: z.boolean().optional(),
    duplicateAtTick: z.enum(["ignoreIfIdentical", "error"]).optional(),
  }),
});

export const gamepadTrackSchema = z.strictObject({
  ...laneTrackCommon,
  kind: z.literal("gamepad"),
  phrases: z.array(phraseDefSchema).optional(),
});

export const trackDefinitionSchema = z.discriminatedUnion("kind", [
  headerTrackSchema,
  globalTrackSchema,
  guitarTrackSchema,
  drumsTrackSchema,
  vocalsTrackSchema,
  gamepadTrackSchema,
]);

/* -------------------------------------------------------------------------- */
/* Root                                                                       */
/* -------------------------------------------------------------------------- */

const RootObjectSchema = z.strictObject({
  $schema: z.string().optional(),
  schemaVersion: z.literal("2.0.0"),
  profile: profileSchema,
  detection: detectionSchema.optional(),
  midi: midiConfigSchema,
  textEventGrammar: textEventGrammarSchema,
  policies: policiesSchema,
  settingsSources: z.array(settingsSourceSchema).optional(),
  playerOptions: z.array(playerOptionSchema).optional(),
  vocabularies: z.record(identifierSchema, vocabularySchema).optional(),
  tracks: z.array(trackDefinitionSchema).min(1),
});

/**
 * Structural schema plus the eight semantic checks listed in the schema's
 * `$comment`. Semantic issues are only evaluated once the structure is valid,
 * so they can assume well-formed input.
 */
export const RulesetSchema = RootObjectSchema.superRefine((ruleset, ctx) => {
  for (const issue of validateRulesetSemantics(ruleset)) {
    ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: `[rule ${issue.rule}] ${issue.message}`,
    });
  }
});

/** Structural-only schema; used by the Ajv differential test. */
export const RulesetStructureSchema = RootObjectSchema;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Ruleset = z.infer<typeof RootObjectSchema>;
export type TrackDefinition = z.infer<typeof trackDefinitionSchema>;
export type HeaderTrackDefinition = z.infer<typeof headerTrackSchema>;
export type GlobalTrackDefinition = z.infer<typeof globalTrackSchema>;
export type GuitarTrackDefinition = z.infer<typeof guitarTrackSchema>;
export type DrumsTrackDefinition = z.infer<typeof drumsTrackSchema>;
export type VocalsTrackDefinition = z.infer<typeof vocalsTrackSchema>;
export type GamepadTrackDefinition = z.infer<typeof gamepadTrackSchema>;
export type TrackKind = TrackDefinition["kind"];
export type LaneDef = z.infer<typeof laneDefSchema>;
export type PadType = z.infer<typeof padTypeSchema>;
export type PhraseDef = z.infer<typeof phraseDefSchema>;
export type PhraseEffect = z.infer<typeof phraseEffectSchema>;
export type Constraint = z.infer<typeof constraintSchema>;
export type Threshold = z.infer<typeof thresholdSchema>;
export type DifficultyNote = z.infer<typeof difficultyNoteSchema>;
export type DifficultyMarker = z.infer<typeof difficultyMarkerSchema>;
export type MarkerEffect = z.infer<typeof markerEffectSchema>;
export type DifficultyBlock = z.infer<typeof difficultyBlockSchema>;
export type DifficultyName = z.infer<typeof difficultyNameSchema>;
export type ModifierDef = z.infer<typeof modifierDefSchema>;
export type EventNoteDef = z.infer<typeof eventNoteDefSchema>;
export type TextEventDef = z.infer<typeof textEventDefSchema>;
export type TextEventArgument = z.infer<typeof textEventArgumentSchema>;
export type VocalNoteClass = z.infer<typeof vocalNoteClassSchema>;
export type PitchRange = z.infer<typeof pitchRangeSchema>;
export type PitchSet = z.infer<typeof pitchSetSchema>;
export type Severity = z.infer<typeof severitySchema>;
export type SettingsSource = z.infer<typeof settingsSourceSchema>;
export type PlayerOption = z.infer<typeof playerOptionSchema>;
export type RulesetPolicies = z.infer<typeof policiesSchema>;

/* -------------------------------------------------------------------------- */
/* Loader                                                                     */
/* -------------------------------------------------------------------------- */

export type LoadRulesetResult =
  { ok: true; ruleset: Ruleset } | { ok: false; issues: RulesetIssue[] };

/**
 * Parse and validate a ruleset from a JSON string or an already-parsed value.
 * Never throws; every failure is reported through `issues`.
 */
export function loadRuleset(json: string | unknown): LoadRulesetResult {
  let data: unknown = json;
  if (typeof json === "string") {
    try {
      data = JSON.parse(json);
    } catch (e) {
      return {
        ok: false,
        issues: [
          {
            path: [],
            rule: "parse",
            message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
      };
    }
  }

  // Run structure first so semantic checks only ever see well-formed input.
  const structural = RootObjectSchema.safeParse(data);
  if (!structural.success) {
    return {
      ok: false,
      issues: structural.error.issues.map((i) => ({
        path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
        rule: "schema",
        message: i.message,
      })),
    };
  }
  const semantic = validateRulesetSemantics(structural.data);
  if (semantic.length > 0) {
    return { ok: false, issues: semantic };
  }
  return { ok: true, ruleset: structural.data };
}

function loadDefaultRuleset(): Ruleset {
  const result = loadRuleset(defaultRulesetData);
  if (!result.ok) {
    const detail = result.issues
      .slice(0, 10)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Bundled default ruleset is invalid:\n${detail}`);
  }
  return result.ruleset;
}

export const DefaultRuleset: Ruleset = loadDefaultRuleset();
