/**
 * The dictionary's shape.
 *
 * `zh` is the reference: every other language file is typed against this, so a
 * key added here is a compile error everywhere it has not been translated yet.
 * That is the point — a missing translation should fail the build rather than
 * fall back to Chinese on an English page.
 */
export type Dictionary = {
  [group: string]: string | Dictionary
}
