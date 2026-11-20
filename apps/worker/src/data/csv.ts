import { LEAD_CSV_COLUMNS, type LeadCsvColumn } from "@inboxsieve/contract";

export type LeadCsvRow = Record<LeadCsvColumn, string | number | null>;

// RFC 4180 quoting. Cells that start with = + - @ get a leading quote so spreadsheets don't run them as formulas.
export function buildLeadsCsv(rows: LeadCsvRow[]) {
  const lines = [
    LEAD_CSV_COLUMNS.join(","),
    ...rows.map((row) => {
      return LEAD_CSV_COLUMNS.map((column) => {
        return escapeCell(row[column]);
      }).join(",");
    }),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function escapeCell(value: string | number | null) {
  if (value === null) {
    return "";
  }
  const text = typeof value === "number" ? String(value) : neutralizeFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function neutralizeFormula(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
