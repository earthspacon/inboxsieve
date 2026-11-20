import { AnalysisContract, type Analysis } from "@inboxsieve/contract";

export function parseAnalysisJson(text: string): Analysis {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new Error("Model reply has no JSON object");
  }

  const data: unknown = JSON.parse(text.slice(start, end + 1));

  if (!AnalysisContract.isData(data)) {
    throw new Error(`Model reply does not match the schema: ${AnalysisContract.getErrorMessages(data).join("; ")}`);
  }

  return data;
}
