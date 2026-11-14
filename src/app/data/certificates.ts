import { dotNet10ApiFetch } from "./api";
import { AUTH_TOKEN_KEY } from "../utils/authStorage";

export interface Certificate {
  id: string;
  fileId: string;
  requestId: string;
  dateOfIssue: string;
  type: string;
  pdf: string;
}

export async function fetchCertificates(signal?: AbortSignal): Promise<Certificate[]> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)?.replace(/^Bearer\s+/i, "");
  const response = await dotNet10ApiFetch("/api/admin/certificates", {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error("حساب کاربری شما اجازه مشاهده گواهی‌ها را ندارد.");
    throw new Error("دریافت گواهی‌ها انجام نشد؛ دوباره تلاش کنید.");
  }
  let payload: unknown;
  try { payload = await response.json(); } catch {
    throw new Error("پاسخ دریافت گواهی‌ها معتبر نیست؛ دوباره تلاش کنید.");
  }
  return readCertificates(payload);
}

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

export function readCertificates(payload: unknown): Certificate[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("پاسخ دریافت گواهی‌ها معتبر نیست.");
  }
  const envelope = payload as Record<string, unknown>;
  if ((envelope.isSuccess ?? envelope.IsSuccess) === false ||
      (envelope.isFailure ?? envelope.IsFailure) === true) {
    const error = (envelope.error ?? envelope.Error) as Record<string, unknown> | undefined;
    throw new Error(text(error?.name ?? error?.Name) || text(error?.description ?? error?.Description) || "دریافت گواهی‌ها انجام نشد.");
  }
  const records = Array.isArray(payload) ? payload : envelope.value ?? envelope.Value;
  if (!Array.isArray(records)) throw new Error("فهرست گواهی‌های دریافتی معتبر نیست.");
  return records.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("اطلاعات یکی از گواهی‌ها معتبر نیست.");
    }
    const fileId = text(item.fileId ?? item.FileId);
    const requestId = text(item.requestId ?? item.RequestId);
    return {
      id: `${fileId}-${requestId}-${index}`,
      fileId,
      requestId,
      dateOfIssue: text(item.dateOfIssue ?? item.DateOfIssue),
      type: text(item.type ?? item.Type) || "گواهی",
      pdf: text(item.pdf ?? item.Pdf ?? item.PDF),
    };
  });
}

/** Decode only embedded PDF bytes; never navigate to a URL supplied as PDF data. */
export function certificatePdfBlob(value: string): Blob {
  const base64 = value.replace(/^data:application\/pdf;base64,/i, "").replace(/\s/g, "");
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("فایل PDF این گواهی دریافت نشده یا معتبر نیست.");
  }
  let binary: string;
  try { binary = atob(base64); } catch {
    throw new Error("فایل PDF این گواهی معتبر نیست.");
  }
  if (!binary.startsWith("%PDF-")) throw new Error("فایل دریافتی از نوع PDF نیست.");
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type: "application/pdf" });
}

export const certificateFileName = (certificate: Certificate) =>
  `${certificate.type}-${certificate.fileId || certificate.requestId || "document"}.pdf`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");

