import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import type { Question } from "@/lib/rules/types";

export function AnswerTable({ columns, rows }: { columns: NonNullable<Question["columns"]>; rows: string[][] }) {
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
      </Table>
    </div>
  );
}
