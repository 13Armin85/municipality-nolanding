import { renovationBillApiFetch } from "./api";
import { readReceiptParams, receiptRecordParams, type ReceiptDetails } from "./receipt";

const englishDigits = (value: string) => value
  .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
const normalizedCode = (value: string) => englishDigits(value).replace(/\s/g, "");
const normalizedId = (value: string) => englishDigits(value).trim();

export function canRefreshReceipt(receipt: ReceiptDetails): boolean {
  return /^\d+(?:-\d+){6}$/.test(normalizedCode(receipt.CodeNosazi)) &&
    /^\d+$/.test(normalizedId(receipt.IdMalek)) && !/^0+$/.test(normalizedId(receipt.IdMalek));
}

const containers = new Set(["value", "data", "result", "results", "items", "bills"]);

function billRecords(payload: unknown, depth = 0): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object" || depth > 6) return [];
  if (Array.isArray(payload)) return payload.flatMap((item) => billRecords(item, depth + 1));
  const record = payload as Record<string, unknown>;
  const entries = Object.entries(record);
  if (entries.some(([key, value]) =>
    (key.toLowerCase() === "issuccess" && value === false) ||
    (key.toLowerCase() === "isfailure" && value === true))) {
    throw new Error("دریافت اطلاعات به‌روز قبض انجام نشد.");
  }
  const params = receiptRecordParams(record);
  if (params.has("ShenaseGhabz") && params.has("ShenasePardakht")) return [record];
  return entries.filter(([key]) => containers.has(key.toLowerCase()))
    .flatMap(([, value]) => billRecords(value, depth + 1));
}

/** Refresh only the requested bill, never the first bill or a different year's bill. */
export async function fetchReceiptDetails(
  receipt: ReceiptDetails,
  signal?: AbortSignal,
): Promise<ReceiptDetails> {
  if (!canRefreshReceipt(receipt)) throw new Error("کد نوسازی یا شناسه مالک برای استعلام قبض کامل نیست.");
  const query = new URLSearchParams({
    codeNosazi: normalizedCode(receipt.CodeNosazi),
    ownerId: normalizedId(receipt.IdMalek),
  });
  const response = await renovationBillApiFetch(`/Api/PaymentAvarez/ReceiveBill?${query}`, {
    method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("دریافت اطلاعات به‌روز قبض انجام نشد؛ دوباره تلاش کنید.");
  const records = billRecords(await response.json());
  const matches = records.map(receiptRecordParams).filter((params) => {
    for (const key of ["ShenaseGhabz", "ShenasePardakht", "ParvandeNo", "IdMalek", "Year", "CodeNosazi"] as const) {
      const expected = receipt[key];
      const actual = params.get(key);
      // Bill and payment identifiers must be present and match when supplied in the link.
      if (expected && (key === "ShenaseGhabz" || key === "ShenasePardakht") && !actual) return false;
      if (expected && actual && (key === "CodeNosazi" ? normalizedCode(expected) !== normalizedCode(actual)
        : normalizedId(expected) !== normalizedId(actual))) return false;
    }
    return true;
  });
  if (matches.length !== 1) throw new Error("اطلاعات دریافتی با این قبض مطابقت ندارد؛ قبض را دوباره استعلام کنید.");

  // Retain link fields omitted by the API; preserve explicit zero amounts and false status.
  const merged = receiptRecordParams(receipt);
  matches[0].forEach((value, key) => merged.set(key, value));
  merged.set("Success", "true");
  const result = readReceiptParams(merged);
  if (!result.success) throw new Error(result.message);
  return result.receipt;
}
