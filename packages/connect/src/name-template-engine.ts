/**
 * The Knap engine behind Reader's name templates (`docs/design/app-settings.md`). Loaded on
 * demand: nothing renders a template until a record is created or the settings are open.
 *
 * Templates come from a collection record anyone with write access can edit, so the engine is
 * locked down: a fixed allow-list of Knap's pure string filters plus Reader's own `slug`, no
 * regular expressions, and small budgets. A template that fails here never blocks a create;
 * the caller falls back to Reader's default names.
 */
import { slug } from "@mdbase-reader/core";

import type { RenderLimits, TemplateEngine, TemplateFilter } from "knap";

/** The filters a name template may use. `slug` is Reader's; the rest are Knap's own. */
export const nameTemplateFilters = [
  "slug",
  "lower",
  "upper",
  "capitalize",
  "title",
  "trim",
  "truncate",
  "replace",
  "split",
  "join",
  "first",
  "last",
  "slice",
  "length",
  "date",
] as const;

/** The longest template the settings schema accepts. */
export const maxNameTemplateLength = 500;

/** `slug` without a length: the same 60 code points Reader's own source names use. */
const defaultSlugCodePoints = 60;
const maxSlugCodePoints = 120;

/** Budgets for one render: a name is short, so anything near these is a mistake. */
export const nameTemplateLimits: Readonly<Required<RenderLimits>> = {
  maxTemplateLength: maxNameTemplateLength,
  maxOutputLength: 4_000,
  maxValueLength: 20_000,
  maxOperations: 5_000,
  maxDepth: 16,
};

export interface NameTemplateRender {
  /** The rendered text, before any naming rule; undefined when the template failed. */
  readonly output?: string;
  /** Why the template failed, when it did. */
  readonly problem?: string;
}

let loading: Promise<TemplateEngine> | undefined;

function nameTemplateEngine(): Promise<TemplateEngine> {
  loading ??= import("knap").then(({ createEngine, standardFilters }) => {
    const filters: Record<string, TemplateFilter> = { slug: slugFilter };
    for (const name of nameTemplateFilters) {
      const filter = Object.hasOwn(standardFilters, name) ? standardFilters[name] : undefined;
      if (filter) {
        filters[name] = filter;
      }
    }
    return createEngine({ filters, limits: nameTemplateLimits, allowRegex: false });
  });
  return loading;
}

/** `slug` or `slug:40`: Reader's slug, the same one its default names use. */
const slugFilter: TemplateFilter = (value, param) => {
  const requested = param === undefined || param === "" ? defaultSlugCodePoints : Number(param);
  const length = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), maxSlugCodePoints)
    : defaultSlugCodePoints;
  return slug(value, length);
};
slugFilter.metadata = {
  example: "slug:40",
  validateParams: (param) =>
    param === undefined || param === "" || /^\d+$/u.test(param.trim())
      ? { valid: true }
      : { valid: false, error: "takes a whole number of characters, such as slug:40" },
};

/** Why `template` cannot be used, or undefined when it can. */
export async function nameTemplateProblem(template: string): Promise<string | undefined> {
  if (!template.trim()) {
    return "Enter a template.";
  }
  if (template.length > maxNameTemplateLength) {
    return `Use at most ${String(maxNameTemplateLength)} characters.`;
  }
  const [error] = (await nameTemplateEngine()).validate(template);
  return error ? templateErrorMessage(error) : undefined;
}

/** Render `template` with `variables`. Never throws: a failure comes back as `problem`. */
export async function renderNameTemplate(
  template: string,
  variables: Readonly<Record<string, unknown>>,
): Promise<NameTemplateRender> {
  try {
    const problem = await nameTemplateProblem(template);
    if (problem) {
      return { problem };
    }
    const result = await (await nameTemplateEngine()).render(template, { variables });
    const [error] = result.errors;
    return error ? { problem: templateErrorMessage(error) } : { output: result.output };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : "The template could not be used." };
  }
}

function templateErrorMessage(error: {
  readonly message: string;
  readonly line: number;
  readonly column: number;
}): string {
  return error.line > 1
    ? `${error.message} (line ${String(error.line)}, column ${String(error.column)})`
    : `${error.message} (column ${String(error.column)})`;
}
