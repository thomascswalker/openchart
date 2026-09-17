/** Runtime validation for project.json. Keep its PascalCase fields stable: it
 * is a public archive format rather than an internal UI model. */
export const PROJECT_FORMAT_VERSION = 1;
export const MIN_DIFFICULTY = 0;
export const MAX_DIFFICULTY = 7;

export interface ProjectMetadata {
  Version: number;
  ID: string;
  Song: {
    Name: string;
    Artist: string;
    Album: string;
    Genre: string;
    Year: number;
    AlbumTrack: number;
    Cover: boolean;
    CoverArtist: string;
    VocalGender: string;
  };
  Chart: { Author: string; PreviewStart: number; PreviewEnd: number };
  Difficulty: {
    Band: number;
    LeadGuitar: number;
    BassGuitar: number;
    Drums: number;
    ProDrums: number;
    Vocals: number;
    Harmony: number;
  };
  Credits: { Publisher: string; Writer: string };
}

export interface ProjectValidationIssue {
  path: string;
  message: string;
}

export class ProjectValidationError extends Error {
  public constructor(
    public readonly issues: readonly ProjectValidationIssue[],
  ) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "ProjectValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(
  issues: ProjectValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message });
}

function stringAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ProjectValidationIssue[],
): string {
  const value = object[key];
  if (typeof value !== "string") {
    issue(issues, `${path}.${key}`, "must be a string");
    return "";
  }
  return value;
}

function integerAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ProjectValidationIssue[],
): number {
  const value = object[key];
  if (!Number.isInteger(value)) {
    issue(issues, `${path}.${key}`, "must be an integer");
    return 0;
  }
  return value;
}

function finiteAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ProjectValidationIssue[],
): number {
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(issues, `${path}.${key}`, "must be a finite number");
    return 0;
  }
  return value;
}

function objectAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ProjectValidationIssue[],
): Record<string, unknown> {
  const value = object[key];
  if (!isRecord(value)) {
    issue(issues, `${path}.${key}`, "must be an object");
    return {};
  }
  return value;
}

export function validateProjectMetadata(value: unknown): ProjectMetadata {
  const issues: ProjectValidationIssue[] = [];
  if (!isRecord(value))
    throw new ProjectValidationError([
      { path: "$", message: "must be an object" },
    ]);

  const version = integerAt(value, "Version", "$", issues);
  if (version !== PROJECT_FORMAT_VERSION) {
    issue(issues, "$.Version", `must be ${PROJECT_FORMAT_VERSION}`);
  }
  const id = stringAt(value, "ID", "$", issues);
  if (!id.trim()) issue(issues, "$.ID", "must not be empty");

  const song = objectAt(value, "Song", "$", issues);
  const Song = {
    Name: stringAt(song, "Name", "$.Song", issues),
    Artist: stringAt(song, "Artist", "$.Song", issues),
    Album: stringAt(song, "Album", "$.Song", issues),
    Genre: stringAt(song, "Genre", "$.Song", issues),
    Year: integerAt(song, "Year", "$.Song", issues),
    AlbumTrack: integerAt(song, "AlbumTrack", "$.Song", issues),
    Cover:
      typeof song.Cover === "boolean"
        ? song.Cover
        : (issue(issues, "$.Song.Cover", "must be a boolean"), false),
    CoverArtist: stringAt(song, "CoverArtist", "$.Song", issues),
    VocalGender: stringAt(song, "VocalGender", "$.Song", issues),
  };
  if (Song.Year < 0) issue(issues, "$.Song.Year", "must be non-negative");
  if (Song.AlbumTrack < 1)
    issue(issues, "$.Song.AlbumTrack", "must be at least 1");

  const chart = objectAt(value, "Chart", "$", issues);
  const Chart = {
    Author: stringAt(chart, "Author", "$.Chart", issues),
    PreviewStart: finiteAt(chart, "PreviewStart", "$.Chart", issues),
    PreviewEnd: finiteAt(chart, "PreviewEnd", "$.Chart", issues),
  };
  if (Chart.PreviewStart < 0)
    issue(issues, "$.Chart.PreviewStart", "must be non-negative");
  if (Chart.PreviewEnd < 0)
    issue(issues, "$.Chart.PreviewEnd", "must be non-negative");
  if (Chart.PreviewEnd < Chart.PreviewStart)
    issue(
      issues,
      "$.Chart.PreviewEnd",
      "must be greater than or equal to PreviewStart",
    );

  const difficulty = objectAt(value, "Difficulty", "$", issues);
  const difficultyKeys = [
    "Band",
    "LeadGuitar",
    "BassGuitar",
    "Drums",
    "ProDrums",
    "Vocals",
    "Harmony",
  ] as const;
  const Difficulty = Object.fromEntries(
    difficultyKeys.map((key) => [
      key,
      integerAt(difficulty, key, "$.Difficulty", issues),
    ]),
  ) as ProjectMetadata["Difficulty"];
  for (const key of difficultyKeys) {
    if (Difficulty[key] < MIN_DIFFICULTY || Difficulty[key] > MAX_DIFFICULTY) {
      issue(
        issues,
        `$.Difficulty.${key}`,
        `must be between ${MIN_DIFFICULTY} and ${MAX_DIFFICULTY}`,
      );
    }
  }

  const credits = objectAt(value, "Credits", "$", issues);
  const Credits = {
    Publisher: stringAt(credits, "Publisher", "$.Credits", issues),
    Writer: stringAt(credits, "Writer", "$.Credits", issues),
  };

  if (issues.length > 0) throw new ProjectValidationError(issues);
  return { Version: version, ID: id, Song, Chart, Difficulty, Credits };
}

function generateProjectId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createProjectMetadata(songName = ""): ProjectMetadata {
  return {
    Version: PROJECT_FORMAT_VERSION,
    ID: generateProjectId(),
    Song: {
      Name: songName,
      Artist: "",
      Album: "",
      Genre: "",
      Year: 0,
      AlbumTrack: 1,
      Cover: false,
      CoverArtist: "",
      VocalGender: "",
    },
    Chart: { Author: "", PreviewStart: 0, PreviewEnd: 0 },
    Difficulty: {
      Band: 0,
      LeadGuitar: 0,
      BassGuitar: 0,
      Drums: 0,
      ProDrums: 0,
      Vocals: 0,
      Harmony: 0,
    },
    Credits: { Publisher: "", Writer: "" },
  };
}
