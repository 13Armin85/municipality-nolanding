import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/app/data/receipt.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { readReceiptParams, getReceiptTotal, getReceiptPaymentStatus } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const sample = {
  Success: "true", ParvandeNo: "12345", IdMalek: "6789", Year: "1405",
  ShenaseGhabz: "1234567890123", ShenasePardakht: "9876543210",
  CodeNosazi: "555", NameOwner: "علی رضایی", Address: "تهران، خیابان نمونه",
  Description: "عوارض نوسازی", DateSodor: "1405/08/05", Price: "2500000",
  DelayedPrice: "0", PaymentStatus: "1",
};
const parse = (overrides = {}) => readReceiptParams(new URLSearchParams({ ...sample, ...overrides }));

test("failed inquiry displays the decoded Message from the supplied URL", () => {
  const result = readReceiptParams(new URLSearchParams("Success=false&Message=%D8%AE%D8%B7%D8%A7%DB%8C%20%D9%BE%D8%B1%D8%AF%D8%A7%D8%AE%D8%AA"));
  assert.deepEqual(result, { success: false, message: "خطای پرداخت" });
});

test("success reads every supplied field and decodes Persian and dates once", () => {
  const result = parse();
  assert.equal(result.success, true);
  for (const [key, value] of Object.entries(sample)) {
    if (key === "Success") continue;
    assert.equal(result.receipt[key], key === "Price" || key === "DelayedPrice" ? Number(value) : value);
  }
  assert.equal(getReceiptTotal(result.receipt), 2500000);
  assert.equal(parse({ Description: "%20" }).receipt.Description, "%20");
});

test("missing or unrecognized Success cannot produce a successful receipt", () => {
  for (const value of ["", "ture", "1", "undefined"]) {
    assert.equal(parse({ Success: value }).success, false);
  }
  assert.equal(readReceiptParams(new URLSearchParams()).success, false);
  assert.ok(parse({ Success: "false" }).message);
});

test("identifiers retain leading zeros and large identifier strings", () => {
  const result = parse({ ShenaseGhabz: "001234567890123456789", IdMalek: "0006789" });
  assert.equal(result.receipt.ShenaseGhabz, "001234567890123456789");
  assert.equal(result.receipt.IdMalek, "0006789");
});

test("late fees and localized amounts contribute to the total in rials", () => {
  const result = parse({ Price: "۲٬۵۰۰٬۰۰۰", DelayedPrice: "٥٠٠٠٠" });
  assert.equal(getReceiptTotal(result.receipt), 2550000);
});

test("Inquiry decimal amounts display both charges and their total and preserve identifiers", () => {
  const result = parse({
    Price: "9700802.0000", DelayedPrice: "881891.0000", PaymentStatus: "False",
    ShenaseGhabz: "0012345678901", ShenasePardakht: "0009876543210",
  });
  assert.equal(result.success, true);
  assert.equal(result.receipt.Price, 9700802);
  assert.equal(result.receipt.DelayedPrice, 881891);
  assert.equal(getReceiptTotal(result.receipt), 10582693);
  assert.equal(getReceiptPaymentStatus(result.receipt.PaymentStatus), "unpaid");
  assert.equal(result.receipt.ShenaseGhabz, "0012345678901");
  assert.equal(result.receipt.ShenasePardakht, "0009876543210");
});

test("whole-rial decimal amounts accept zero, localized digits and safe integer boundaries", () => {
  assert.equal(getReceiptTotal(parse({ Price: "0.0000", DelayedPrice: "0.0000" }).receipt), 0);
  assert.equal(getReceiptTotal(parse({ Price: "۹٬۷۰۰٬۸۰۲.۰۰۰۰", DelayedPrice: "٨٨١٨٩١.٠٠٠٠" }).receipt), 10582693);
  assert.equal(getReceiptTotal(parse({ Price: "9007199254740991.0000" }).receipt), Number.MAX_SAFE_INTEGER);
});

test("invalid, negative, fractional and unsafe amounts stay invalid", () => {
  for (const value of ["", "-1", "1.5", "1.0001", "1.0000000000000001", "1.", ".0", "Infinity", "NaN", "1e6", "0xFF", "abc", "9007199254740992", "9007199254740992.0000"]) {
    assert.equal(getReceiptTotal(parse({ Price: value }).receipt), null, value);
  }
  assert.equal(getReceiptTotal(parse({ DelayedPrice: "invalid" }).receipt), null);
  assert.equal(getReceiptTotal(parse({ DelayedPrice: "0.0001" }).receipt), null);
  assert.equal(getReceiptTotal(parse({ Price: String(Number.MAX_SAFE_INTEGER), DelayedPrice: "1" }).receipt), null);
  assert.equal(getReceiptTotal(parse({ Price: "9007199254740991.0000", DelayedPrice: "1.0000" }).receipt), null);
  assert.equal(getReceiptTotal(parse({ Price: "0" }).receipt), 0);
});

test("an omitted late fee defaults to zero and a missing price stays invalid", () => {
  assert.equal(getReceiptTotal(parse({ DelayedPrice: "" }).receipt), 2500000);
  assert.equal(getReceiptTotal(parse({ Price: "" }).receipt), null);
});

test("payment state follows the existing renovation contract without guessing unknown codes", () => {
  for (const value of ["1", "true", "TRUE", "۱", "١"]) assert.equal(getReceiptPaymentStatus(value), "paid");
  for (const value of ["0", "false", "FALSE", "۰", "٠"]) assert.equal(getReceiptPaymentStatus(value), "unpaid");
  for (const value of ["", "2", "paid"]) assert.equal(getReceiptPaymentStatus(value), "unknown");
});

test("missing display fields remain empty instead of inventing receipt data", () => {
  const result = readReceiptParams(new URLSearchParams("Success=true"));
  assert.equal(result.receipt.NameOwner, "");
  assert.equal(result.receipt.ShenaseGhabz, "");
  assert.equal(getReceiptTotal(result.receipt), null);
  assert.equal(getReceiptPaymentStatus(result.receipt.PaymentStatus), "unknown");
});
