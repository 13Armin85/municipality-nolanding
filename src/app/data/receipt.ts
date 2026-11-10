export interface ReceiptDetails {
  ParvandeNo: string;
  IdMalek: string;
  Year: string;
  ShenaseGhabz: string;
  ShenasePardakht: string;
  CodeNosazi: string;
  NameOwner: string;
  Address: string;
  Description: string;
  DateSodor: string;
  Price: number | null;
  DelayedPrice: number | null;
  PaymentStatus: string;
}

export type ReceiptResult =
  | { success: false; message: string }
  | { success: true; receipt: ReceiptDetails; message: string };

const englishDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

const parseAmount = (value: string): number | null => {
  const normalized = englishDigits(value).replace(/[,٬]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? amount : null;
};

// URLSearchParams decodes Persian text and escaped dates; do not decode twice.
export function readReceiptParams(params: URLSearchParams): ReceiptResult {
  const values = new Map<string, string>();
  params.forEach((value, key) => values.set(key.toLowerCase(), value.trim()));
  const read = (key: string) => values.get(key.toLowerCase()) ?? "";
  const success = read("Success").toLowerCase();
  const message = read("Message");

  if (success !== "true") {
    return {
      success: false,
      message: message || (success === "false"
        ? "دریافت اطلاعات قبض انجام نشد. لطفاً دوباره تلاش کنید."
        : "لینک قبض معتبر نیست یا اطلاعات آن کامل ارسال نشده است."),
    };
  }

  return {
    success: true,
    message,
    receipt: {
      ParvandeNo: read("ParvandeNo"),
      IdMalek: read("IdMalek"),
      Year: read("Year"),
      ShenaseGhabz: read("ShenaseGhabz"),
      ShenasePardakht: read("ShenasePardakht"),
      CodeNosazi: read("CodeNosazi"),
      NameOwner: read("NameOwner"),
      Address: read("Address"),
      Description: read("Description"),
      DateSodor: read("DateSodor"),
      Price: parseAmount(read("Price")),
      // Older links may omit the late fee; an explicitly invalid fee stays invalid.
      DelayedPrice: read("DelayedPrice") ? parseAmount(read("DelayedPrice")) : 0,
      PaymentStatus: read("PaymentStatus"),
    },
  };
}

export function getReceiptPaymentStatus(value: string) {
  const normalized = englishDigits(value).toLowerCase();
  if (normalized === "1" || normalized === "true") return "paid";
  if (normalized === "0" || normalized === "false") return "unpaid";
  return "unknown";
}

export function getReceiptTotal(receipt: ReceiptDetails): number | null {
  if (receipt.Price === null || receipt.DelayedPrice === null) return null;
  const total = receipt.Price + receipt.DelayedPrice;
  return Number.isSafeInteger(total) ? total : null;
}
