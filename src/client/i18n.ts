/**
 * Generic locale catalog for the dsh-pstack client surfaces.
 *
 * A capability declares its copy once per supported locale. `LocaleCatalog`
 * binds every dictionary to the base key set and to every entry in
 * `SUPPORTED_LOCALES`, so a new language is one entry here plus one dictionary
 * per capability. TypeScript fails until every locale is translated, so an
 * untranslated language cannot hide behind an implicit base pair.
 */

/** Locale ids the dsh-pstack client surfaces currently ship. */
export const SUPPORTED_LOCALES = ["en", "zh"] as const;

/** One shipped locale id. */
export type PstackLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * A capability's dictionaries: one complete dictionary per supported locale.
 * Every locale must expose exactly the base dictionary's keys.
 */
export type LocaleCatalog<Key extends string> = Record<PstackLocale, Record<Key, string>>;
