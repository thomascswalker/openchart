/**
 * Cross-reference checks that JSON Schema cannot express. These are the eight
 * rules from the `$comment` in `configs/schema.json`:
 *
 *  1. No pitch is claimed twice within a track, except by phrases that list
 *     each other in `sharesPitchesWith`.
 *  2. Reserved ranges do not overlap claimed pitches.
 *  3. Every referenced id resolves.
 *  4. Ids are unique within their track.
 *  5. Track names are unique across tracks.
 *  6. All regex patterns compile.
 *  7. `pitchRange.from <= pitchRange.to`.
 *  8. `honoredOnTracks` is a subset of the track's `trackNames`.
 *
 * Runtime-free of Zod on purpose (type imports only) so it can run on any
 * structurally valid ruleset.
 */

import {
  PitchSet,
  PitchRange,
  Ruleset,
  TrackDefinition,
  Threshold,
  Condition,
} from "./config";

export interface RulesetIssue {
  path: (string | number)[];
  /** Semantic rule number (1-8), or `"schema"` / `"parse"` for structural. */
  rule: number | "schema" | "parse";
  message: string;
}

type Path = (string | number)[];

/** Expand a pitch set (list or inclusive range) to concrete pitches. */
export function expandPitchSet(set: PitchSet): number[] {
  if (Array.isArray(set)) return [...set];
  const out: number[] = [];
  for (let p = set.from; p <= set.to; p++) out.push(p);
  return out;
}

export function expandPitchRange(range: PitchRange): number[] {
  return expandPitchSet(range);
}

interface Claim {
  pitch: number;
  owner: string;
  path: Path;
  /** Phrase id when the claim comes from a phrase (for `sharesPitchesWith`). */
  phraseId?: string;
  shares?: readonly string[];
}

const trackKeyOf = (t: TrackDefinition, i: number): Path => ["tracks", i];

export function validateRulesetSemantics(r: Ruleset): RulesetIssue[] {
  const issues: RulesetIssue[] = [];
  const add = (path: Path, rule: number, message: string) =>
    issues.push({ path, rule, message });

  // Rule 5 -----------------------------------------------------------------
  const seenNames = new Map<string, number>();
  r.tracks.forEach((t, ti) => {
    t.trackNames.forEach((name, ni) => {
      const prev = seenNames.get(name);
      if (prev !== undefined) {
        add(
          ["tracks", ti, "trackNames", ni],
          5,
          `Track name "${name}" is already used by tracks[${prev}]`,
        );
      } else {
        seenNames.set(name, ti);
      }
    });
  });
  const seenTrackIds = new Map<string, number>();
  r.tracks.forEach((t, ti) => {
    const prev = seenTrackIds.get(t.id);
    if (prev !== undefined) {
      add(
        ["tracks", ti, "id"],
        4,
        `Track id "${t.id}" duplicates tracks[${prev}]`,
      );
    } else {
      seenTrackIds.set(t.id, ti);
    }
  });

  const settingKeys = new Map<string, Set<string>>();
  for (const s of r.settingsSources ?? []) {
    settingKeys.set(s.id, new Set(s.keys.map((k) => k.name)));
  }
  const playerOptionIds = new Set((r.playerOptions ?? []).map((o) => o.id));
  const vocabularyIds = new Set(Object.keys(r.vocabularies ?? {}));
  const allTrackNames = new Set(seenNames.keys());
  const textEventIdsByTrackName = new Map<string, Set<string>>();
  for (const t of r.tracks) {
    const ids = new Set((t.textEvents ?? []).map((e) => e.id));
    for (const n of t.trackNames) textEventIdsByTrackName.set(n, ids);
  }

  // Detection --------------------------------------------------------------
  for (const [key, list] of [
    ["requiredTracks", r.detection?.requiredTracks],
    ["forbiddenTracks", r.detection?.forbiddenTracks],
  ] as const) {
    list?.forEach((name, i) => {
      if (!allTrackNames.has(name)) {
        add(["detection", key, i], 3, `Unknown track name "${name}"`);
      }
    });
  }

  // Settings references ------------------------------------------------------
  const checkSettingRef = (path: Path, source: string, key: string) => {
    const keys = settingKeys.get(source);
    if (!keys) {
      add(path, 3, `Unknown settings source "${source}"`);
    } else if (!keys.has(key)) {
      add(path, 3, `Settings source "${source}" has no key "${key}"`);
    }
  };

  const checkThreshold = (path: Path, t: Threshold | undefined) => {
    t?.overrides?.forEach((o, i) =>
      checkSettingRef([...path, "overrides", i], o.source, o.key),
    );
  };

  // Rule 7 helper ----------------------------------------------------------
  const checkRange = (path: Path, range: PitchRange) => {
    if (range.from > range.to) {
      add(
        path,
        7,
        `Range from (${range.from}) is greater than to (${range.to})`,
      );
    }
  };
  const checkPitchSet = (path: Path, set: PitchSet) => {
    if (!Array.isArray(set)) checkRange(path, set);
  };

  r.tracks.forEach((t, ti) => {
    const tp: Path = trackKeyOf(t, ti);
    const trackNames = new Set(t.trackNames);

    // ---- Rule 4: id uniqueness per kind of definition ----------------------
    const uniq = (
      kind: string,
      items: readonly { id: string }[] | undefined,
    ) => {
      const seen = new Set<string>();
      items?.forEach((item, i) => {
        if (seen.has(item.id)) {
          add(
            [...tp, kind, i, "id"],
            4,
            `Duplicate ${kind} id "${item.id}" in track "${t.id}"`,
          );
        }
        seen.add(item.id);
      });
      return seen;
    };

    const lanes = "lanes" in t ? t.lanes : undefined;
    const phrases = "phrases" in t ? t.phrases : undefined;
    const modifiers = "modifiers" in t ? t.modifiers : undefined;
    const noteClasses = "noteClasses" in t ? t.noteClasses : undefined;

    const laneIds = uniq("lanes", lanes);
    const phraseIds = uniq("phrases", phrases);
    const modifierIds = uniq("modifiers", modifiers);
    const noteClassIds = uniq("noteClasses", noteClasses);
    const eventNoteIds = uniq("eventNotes", t.eventNotes);
    const textEventIds = uniq("textEvents", t.textEvents);
    uniq("constraints", t.constraints);

    // ---- Claims (rules 1 & 2) ---------------------------------------------
    const claims: Claim[] = [];
    const claim = (
      pitch: number,
      owner: string,
      path: Path,
      phrase?: { id: string; shares: readonly string[] },
    ) => {
      const c: Claim = { pitch, owner, path };
      if (phrase) {
        c.phraseId = phrase.id;
        c.shares = phrase.shares;
      }
      claims.push(c);
    };

    const reservedRanges: { range: PitchRange; path: Path }[] = [];
    t.reserved?.forEach((range, i) => {
      checkRange([...tp, "reserved", i], range);
      reservedRanges.push({ range, path: [...tp, "reserved", i] });
    });

    if ("difficulties" in t) {
      for (const [diff, block] of Object.entries(t.difficulties)) {
        if (!block) continue;
        const dp: Path = [...tp, "difficulties", diff];
        block.notes.forEach((n, i) => {
          claim(n.pitch, `${diff} note`, [...dp, "notes", i, "pitch"]);
          if (!laneIds.has(n.lane)) {
            add([...dp, "notes", i, "lane"], 3, `Unknown lane "${n.lane}"`);
          }
          if (n.padType) {
            const lane = lanes?.find((l) => l.id === n.lane);
            if (lane?.padTypes && !lane.padTypes.includes(n.padType)) {
              add(
                [...dp, "notes", i, "padType"],
                3,
                `Lane "${n.lane}" does not support pad type "${n.padType}"`,
              );
            }
          }
          if (n.enabledWhen)
            checkCondition([...dp, "notes", i, "enabledWhen"], n.enabledWhen);
        });
        block.markers?.forEach((m, i) =>
          claim(m.pitch, `${diff} marker`, [...dp, "markers", i, "pitch"]),
        );
        block.reserved?.forEach((range, i) => {
          checkRange([...dp, "reserved", i], range);
          reservedRanges.push({ range, path: [...dp, "reserved", i] });
        });
      }
    }

    phrases?.forEach((ph, i) => {
      ph.pitches.forEach((p, pi) =>
        claim(p, `phrase "${ph.id}"`, [...tp, "phrases", i, "pitches", pi], {
          id: ph.id,
          shares: ph.sharesPitchesWith ?? [],
        }),
      );
      ph.sharesPitchesWith?.forEach((other, oi) => {
        if (!phraseIds.has(other)) {
          add(
            [...tp, "phrases", i, "sharesPitchesWith", oi],
            3,
            `Unknown phrase "${other}"`,
          );
        }
      });
      if (ph.enabledWhen)
        checkCondition([...tp, "phrases", i, "enabledWhen"], ph.enabledWhen);
      if (ph.requires)
        checkCondition([...tp, "phrases", i, "requires"], ph.requires);
      if (ph.alsoActsAs)
        checkCondition(
          [...tp, "phrases", i, "alsoActsAs", "when"],
          ph.alsoActsAs.when,
        );
      checkThreshold(
        [...tp, "phrases", i, "activation", "window"],
        ph.activation?.window,
      );
    });

    t.eventNotes?.forEach((en, i) => {
      checkPitchSet([...tp, "eventNotes", i, "pitches"], en.pitches);
      expandPitchSet(en.pitches).forEach((p) =>
        claim(p, `eventNote "${en.id}"`, [...tp, "eventNotes", i, "pitches"]),
      );
    });

    noteClasses?.forEach((nc, i) => {
      checkPitchSet([...tp, "noteClasses", i, "pitches"], nc.pitches);
      expandPitchSet(nc.pitches).forEach((p) =>
        claim(p, `noteClass "${nc.id}"`, [...tp, "noteClasses", i, "pitches"]),
      );
    });

    modifiers?.forEach((m, i) => {
      if (m.source.kind === "note") {
        claim(m.source.pitch, `modifier "${m.id}"`, [
          ...tp,
          "modifiers",
          i,
          "source",
          "pitch",
        ]);
      }
      m.appliesToLanes?.forEach((l, li) => {
        if (!laneIds.has(l))
          add(
            [...tp, "modifiers", i, "appliesToLanes", li],
            3,
            `Unknown lane "${l}"`,
          );
      });
      m.excludeLanes?.forEach((l, li) => {
        if (!laneIds.has(l))
          add(
            [...tp, "modifiers", i, "excludeLanes", li],
            3,
            `Unknown lane "${l}"`,
          );
      });
      if (m.enabledWhen)
        checkCondition([...tp, "modifiers", i, "enabledWhen"], m.enabledWhen);
    });

    // Rule 1
    const byPitch = new Map<number, Claim[]>();
    for (const c of claims) {
      const list = byPitch.get(c.pitch) ?? [];
      list.push(c);
      byPitch.set(c.pitch, list);
    }
    for (const [pitch, list] of byPitch) {
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const x = list[a]!;
          const y = list[b]!;
          const mutual =
            x.phraseId !== undefined &&
            y.phraseId !== undefined &&
            x.shares!.includes(y.phraseId) &&
            y.shares!.includes(x.phraseId);
          if (!mutual) {
            add(
              y.path,
              1,
              `Pitch ${pitch} is claimed by both ${x.owner} and ${y.owner} in track "${t.id}"`,
            );
          }
        }
      }
    }

    // Rule 2
    for (const { range, path } of reservedRanges) {
      for (let p = range.from; p <= range.to; p++) {
        const hit = byPitch.get(p);
        if (hit) {
          add(
            path,
            2,
            `Reserved pitch ${p} is also claimed by ${hit[0]!.owner}`,
          );
          break;
        }
      }
    }

    // ---- Lanes ------------------------------------------------------------
    lanes?.forEach((lane, i) => {
      lane.onlyOnTracks?.forEach((n, ni) => {
        if (!trackNames.has(n)) {
          add(
            [...tp, "lanes", i, "onlyOnTracks", ni],
            3,
            `Track "${n}" is not one of this definition's trackNames`,
          );
        }
      });
      if (
        lane.defaultPadType &&
        lane.padTypes &&
        !lane.padTypes.includes(lane.defaultPadType)
      ) {
        add(
          [...tp, "lanes", i, "defaultPadType"],
          3,
          `defaultPadType "${lane.defaultPadType}" is not in padTypes`,
        );
      }
    });

    // ---- Text events (rules 6 & 8) -----------------------------------------
    t.textEvents?.forEach((e, i) => {
      if ("pattern" in e) {
        try {
          new RegExp(e.pattern);
        } catch (err) {
          add(
            [...tp, "textEvents", i, "pattern"],
            6,
            `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      e.honoredOnTracks?.forEach((n, ni) => {
        if (!trackNames.has(n)) {
          add(
            [...tp, "textEvents", i, "honoredOnTracks", ni],
            8,
            `"${n}" is not one of this definition's trackNames`,
          );
        }
      });
      if ("arguments" in e) {
        e.arguments?.forEach((arg, ai) => {
          if (arg.vocabulary && !vocabularyIds.has(arg.vocabulary)) {
            add(
              [...tp, "textEvents", i, "arguments", ai, "vocabulary"],
              3,
              `Unknown vocabulary "${arg.vocabulary}"`,
            );
          }
        });
        e.arguments?.forEach((arg, ai, all) => {
          if (arg.variadic && ai !== all.length - 1) {
            add(
              [...tp, "textEvents", i, "arguments", ai, "variadic"],
              3,
              "Only the last argument may be variadic",
            );
          }
        });
      }
    });

    // ---- Header version check ----------------------------------------------
    if (t.kind === "header" && t.versionCheck) {
      const ev = t.textEvents?.find((e) => e.id === t.versionCheck!.textEvent);
      if (!ev) {
        add(
          [...tp, "versionCheck", "textEvent"],
          3,
          `Unknown text event "${t.versionCheck.textEvent}"`,
        );
      } else if ("pattern" in ev) {
        const names = ev.captures?.map((c) => c.name) ?? [];
        if (!names.includes(t.versionCheck.argument)) {
          add(
            [...tp, "versionCheck", "argument"],
            3,
            `Text event "${ev.id}" has no capture "${t.versionCheck.argument}"`,
          );
        }
      } else if (
        !ev.arguments?.some((a) => a.name === t.versionCheck!.argument)
      ) {
        add(
          [...tp, "versionCheck", "argument"],
          3,
          `Text event "${ev.id}" has no argument "${t.versionCheck.argument}"`,
        );
      }
    }

    // ---- Constraints ---------------------------------------------------------
    const markerEffects = new Set<string>();
    if ("difficulties" in t) {
      for (const block of Object.values(t.difficulties)) {
        block?.markers?.forEach((m) => markerEffects.add(m.effect));
      }
    }
    const needPhrase = (path: Path, id: string) => {
      if (!phraseIds.has(id)) add(path, 3, `Unknown phrase "${id}"`);
    };
    const needNoteClass = (path: Path, id: string) => {
      if (!noteClassIds.has(id)) add(path, 3, `Unknown noteClass "${id}"`);
    };
    t.constraints?.forEach((c, i) => {
      const cp: Path = [...tp, "constraints", i];
      switch (c.rule) {
        case "forbiddenPitches":
          checkPitchSet([...cp, "pitches"], c.pitches);
          break;
        case "mutuallyExclusiveAtTick":
          c.members.forEach((m, mi) => {
            if (!markerEffects.has(m) && !modifierIds.has(m)) {
              add(
                [...cp, "members", mi],
                3,
                `"${m}" is neither a marker effect nor a modifier id on this track`,
              );
            }
          });
          break;
        case "notesWithinPhrase":
          c.phrases.forEach((p, pi) => needPhrase([...cp, "phrases", pi], p));
          c.noteClasses.forEach((n, ni) =>
            needNoteClass([...cp, "noteClasses", ni], n),
          );
          break;
        case "monophonic":
          c.noteClasses.forEach((n, ni) =>
            needNoteClass([...cp, "noteClasses", ni], n),
          );
          break;
        case "phrasesMayNotOverlap":
          c.phrases.forEach((p, pi) => needPhrase([...cp, "phrases", pi], p));
          break;
        case "phraseMustBeBetween":
          needPhrase([...cp, "phrase"], c.phrase);
          needPhrase([...cp, "between"], c.between);
          break;
        case "noSustains":
          checkThreshold([...cp, "threshold"], c.threshold);
          break;
        default:
          break;
      }
    });

    // ---- Mechanics thresholds --------------------------------------------------
    if (t.kind === "guitar" && t.mechanics) {
      const m = t.mechanics;
      checkThreshold([...tp, "mechanics", "hopoThreshold"], m.hopoThreshold);
      checkThreshold([...tp, "mechanics", "sustainCutoff"], m.sustainCutoff);
      checkThreshold([...tp, "mechanics", "sustainGap"], m.sustainGap);
      checkThreshold(
        [...tp, "mechanics", "positionSnap", "threshold"],
        m.positionSnap?.threshold,
      );
    }

    // ---- Drum variants ---------------------------------------------------------
    if (t.kind === "drums") {
      const supported = new Set(t.variants.supported);
      t.variants.authored.forEach((v, i) => {
        if (!supported.has(v))
          add(
            [...tp, "variants", "authored", i],
            3,
            `Variant "${v}" is not in supported`,
          );
      });
      t.variants.detection.forEach((d, i) => {
        const dp: Path = [...tp, "variants", "detection", i];
        const result = "default" in d ? d.default : d.result;
        if (!supported.has(result))
          add(dp, 3, `Variant "${result}" is not in supported`);
        if ("when" in d) checkCondition([...dp, "when"], d.when, supported);
      });
      t.variants.derivations?.forEach((d, i) => {
        for (const key of ["variant", "from"] as const) {
          if (!supported.has(d[key])) {
            add(
              [...tp, "variants", "derivations", i, key],
              3,
              `Variant "${d[key]}" is not in supported`,
            );
          }
        }
      });
      if (t.variants.rejectWhen) {
        checkCondition(
          [...tp, "variants", "rejectWhen"],
          t.variants.rejectWhen,
          supported,
        );
      }
    }

    // ---- Conditions -------------------------------------------------------------
    function checkCondition(
      path: Path,
      c: Condition,
      variants: ReadonlySet<string> | undefined = t.kind === "drums"
        ? new Set(t.variants.supported)
        : undefined,
    ): void {
      if ("textEvent" in c) {
        let ids: ReadonlySet<string> = textEventIds;
        if (c.track && c.track !== "self") {
          const other = textEventIdsByTrackName.get(c.track);
          if (!other) {
            add([...path, "track"], 3, `Unknown track name "${c.track}"`);
            return;
          }
          ids = other;
        }
        if (!ids.has(c.textEvent))
          add([...path, "textEvent"], 3, `Unknown text event "${c.textEvent}"`);
      } else if ("setting" in c) {
        checkSettingRef([...path, "setting"], c.setting.source, c.setting.key);
      } else if ("playerOption" in c) {
        if (!playerOptionIds.has(c.playerOption))
          add(
            [...path, "playerOption"],
            3,
            `Unknown player option "${c.playerOption}"`,
          );
      } else if ("variant" in c) {
        if (!variants?.has(c.variant))
          add([...path, "variant"], 3, `Unknown variant "${c.variant}"`);
      } else if ("phraseAbsent" in c) {
        if (!phraseIds.has(c.phraseAbsent))
          add(
            [...path, "phraseAbsent"],
            3,
            `Unknown phrase "${c.phraseAbsent}"`,
          );
      } else if ("allOf" in c) {
        c.allOf.forEach((s, i) =>
          checkCondition([...path, "allOf", i], s, variants),
        );
      } else if ("anyOf" in c) {
        c.anyOf.forEach((s, i) =>
          checkCondition([...path, "anyOf", i], s, variants),
        );
      } else {
        checkCondition([...path, "not"], c.not, variants);
      }
    }

    // eventNoteIds / textEventIds are used above; silence unused warnings.
    void eventNoteIds;
  });

  // Global vocab / text-event arguments are handled per track; vocabularies
  // themselves have no cross references.
  return issues;
}
