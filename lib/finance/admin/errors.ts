import { pgCode } from "@/lib/db";

export function plainError(error: unknown): string {
  const code = pgCode(error);
  if (code === "42501") return "Your role does not allow this action. Ask a Finance administrator for help.";
  if (code === "40001") return "Someone else changed this record first. Reload the page and try again.";
  if (code === "23514") return "That change is not allowed for the record in its current state.";
  if (code === "23505" && (error as { constraint?: string }).constraint === "initiative_name_year_idx") return "An initiative with that name already exists in this fiscal year. Choose a different name.";
  if (code === "23505") return "A record with those details already exists.";
  if (code === "23503") return "A related record could not be found. Reload the page and try again.";
  if (code === "22P02") return "One of the values is not in a valid format.";
  if (code === "22003") return "One of the numbers is too large. Check the amounts and try again.";
  if (code === "22001") return "One of the values is too long. Shorten it and try again.";
  if (code === "22007" || code === "22008") return "One of the dates is not a real calendar date.";
  if (code === "23502") return "A required value is missing. Fill in every required field.";
  return "Something went wrong and nothing was saved. Try again, and contact support if it keeps happening.";
}
