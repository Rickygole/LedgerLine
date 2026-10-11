import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import type { Question } from "@/lib/rules/types";

export function AnswerTable({
  columns,
  rows,
  totals,
}: {
  columns: NonNullable<Question["columns"]>;
  rows: string[][];
  totals?: string[] | null;
}) {
  const primary = columns.findIndex((column) => column.type === "text");
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <Table density="compact" stack>
        <THead>
          <tr>
            {columns.map((column) => (
              <TH key={column.key} align={column.type === "text" ? "left" : "right"}>
                {column.label}
              </TH>
            ))}
          </tr>
        </THead>
        <tbody>
          {rows.map((row, index) => (
            <TR key={index}>
              {columns.map((column, cellIndex) => {
                const cell = row[cellIndex] ?? "";
                const numeric = column.type !== "text";
                return (
                  <TD
                    key={column.key}
                    align={numeric ? "right" : "left"}
                    primary={cellIndex === primary}
                    label={cellIndex === primary ? undefined : column.label}
                  >
                    {cell === "" ? null : <span>{cell}</span>}
                  </TD>
                );
              })}
            </TR>
          ))}
        </tbody>
        {totals ? (
          <tfoot className="border-t border-line bg-surface/60">
            <tr className="max-md:flex-wrap">
              {columns.map((column, cellIndex) => {
                const cell = totals[cellIndex] ?? "";
                const numeric = column.type !== "text";
                return (
                  <TD
                    key={column.key}
                    align={numeric ? "right" : "left"}
                    primary={cellIndex === primary}
                    label={cellIndex === primary || cell === "" ? undefined : column.label}
                    className="font-bold max-md:w-full"
                  >
                    {cell === "" ? null : <span>{cell}</span>}
                  </TD>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </Table>
    </div>
  );
}
