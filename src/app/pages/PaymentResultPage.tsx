import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Home,
  LoaderCircle,
  Printer,
  ReceiptText,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { downloadPaymentReceipt } from "../data/paymentReceipt";

const receiptIdParamNames = [
  "id",
  "Id",
  "message",
  "Message",
  "paymentId",
  "PaymentId",
  "paymentLogId",
  "PaymentLogId",
  "trackingCode",
  "TrackingCode",
  "payGateTranId",
  "PayGateTranId",
];

const isSuccessfulPayment = (params: URLSearchParams) => {
  for (const [name, value] of params.entries()) {
    if (
      name.toLocaleLowerCase("en-US") === "success" &&
      value.trim().toLocaleLowerCase("en-US") === "true"
    ) {
      return true;
    }
  }

  return false;
};

const getReceiptId = (params: URLSearchParams) =>
  receiptIdParamNames
    .map((name) => params.get(name)?.trim())
    .find((value): value is string => Boolean(value));

export function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const isSuccess = isSuccessfulPayment(searchParams);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const receiptButtonRef = useRef<HTMLButtonElement>(null);
  const receiptRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => receiptRequestRef.current?.abort(), []);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const handlePrint = () => {
    try {
      previewFrameRef.current?.contentWindow?.focus();
      previewFrameRef.current?.contentWindow?.print();
    } catch {
      setDownloadError("چاپ قبض انجام نشد؛ می‌توانید فایل PDF را دانلود و چاپ کنید.");
    }
  };

  const handlePreviewOpenChange = (open: boolean) => {
    setIsPreviewOpen(open);
    if (!open) {
      receiptRequestRef.current?.abort();
      receiptRequestRef.current = null;
      setIsDownloading(false);
      setIsPreviewReady(false);
      setPreview(null);
      setDownloadError("");
    }
  };

  const handleDownloadPaymentReceipt = async () => {
    const receiptId = getReceiptId(searchParams);
    if (!receiptId) {
      setDownloadError("شناسه تراکنش برای دریافت سابقه پرداخت موجود نیست.");
      return;
    }

    receiptRequestRef.current?.abort();
    const controller = new AbortController();
    receiptRequestRef.current = controller;
    setIsPreviewOpen(true);
    setIsDownloading(true);
    setIsPreviewReady(false);
    setDownloadError("");

    try {
      const { blob, filename } = await downloadPaymentReceipt(receiptId, controller.signal);
      if (controller.signal.aborted) return;
      setPreview({ url: URL.createObjectURL(blob), filename });
    } catch (error) {
      if (controller.signal.aborted) return;
      setDownloadError(
        error instanceof Error
          ? error.message
          : "دانلود سابقه پرداخت انجام نشد.",
      );
    } finally {
      if (receiptRequestRef.current === controller) {
        receiptRequestRef.current = null;
        setIsDownloading(false);
      }
    }
  };

  return (
    <main
      dir="rtl"
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#071712] px-4 py-10 text-[#f4fbf8]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(33,118,99,0.12),transparent_42%)]"
      />

      <section className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#24483f] bg-[#0c211b] shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
        <div
          className={`h-1.5 w-full ${
            isSuccess ? "bg-[#35c4b2]" : "bg-[#e68189]"
          }`}
        />
        <div className="px-6 py-8 text-center sm:px-8 sm:py-9">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border ${
              isSuccess
                ? "border-[#35c4b2]/20 bg-[#35c4b2]/10 text-[#46d5c2]"
                : "border-[#e68189]/15 bg-[#e68189]/10 text-[#e68189]"
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 className="h-9 w-9" />
            ) : (
              <AlertCircle className="h-9 w-9" />
            )}
          </div>

          <h1 className="mt-5 text-xl font-bold text-white">
            {isSuccess ? "پرداخت با موفقیت تأیید شد" : "پرداخت انجام نشد"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#9ab5ad]">
            {isSuccess
              ? "پرداخت شما با موفقیت انجام و در سامانه ثبت شد."
              : "پرداخت شما انجام نشد. لطفاً دوباره تلاش کنید."}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#36c3b2] px-5 text-sm font-bold text-[#06201a] transition-colors hover:bg-[#4bd3c2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#78e1d4]"
            >
              <Home className="h-4 w-4" />
              ورود به صفحه اصلی
            </Link>
            {isSuccess ? (
              <button
                ref={receiptButtonRef}
                type="button"
                onClick={handleDownloadPaymentReceipt}
                disabled={isDownloading}
                aria-busy={isDownloading}
                aria-haspopup="dialog"
                aria-expanded={isPreviewOpen}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#36c3b2] bg-[#06201a] px-5 text-sm font-bold text-[#f4fbf8] transition-colors hover:bg-[#142e27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#78e1d4] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDownloading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isDownloading
                  ? "در حال آماده‌سازی..."
                  : "دانلود قبض"}
              </button>
            ) : null}
            <Link
              to="/modern-toll"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#315248] bg-transparent px-5 text-sm font-bold text-[#eaf4f1] transition-colors hover:bg-[#142e27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#537b70]"
            >
              <ReceiptText className="h-4 w-4" />
              مشاهده عوارض
            </Link>
          </div>

          {downloadError && !isPreviewOpen ? (
            <p role="alert" className="mt-3 text-sm leading-6 text-[#f3a0a7]">
              {downloadError}
            </p>
          ) : null}
        </div>
      </section>
      <Dialog.Root
        open={isPreviewOpen}
        onOpenChange={handlePreviewOpenChange}
      >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
            <Dialog.Content
              dir="rtl"
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                receiptButtonRef.current?.focus();
              }}
              className="fixed left-1/2 top-1/2 z-50 flex h-[min(75dvh,650px)] w-[min(90vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[#315248] bg-[#0c211b] shadow-2xl focus:outline-none"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#315248] px-4 py-3 sm:px-5">
                <Dialog.Title className="text-base font-bold text-white">
                  پیش‌نمایش قبض پرداخت
                </Dialog.Title>
                <Dialog.Close className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#537b70] px-3 text-sm font-bold text-white hover:bg-[#24483f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#78e1d4]" aria-label="بستن پیش‌نمایش قبض">
                  <X className="h-4 w-4" />
                  بستن
                </Dialog.Close>
              </div>
              <div className="flex items-center justify-center gap-2 border-b border-[#315248] px-4 py-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={!isPreviewReady}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#36c3b2] px-3 text-sm font-bold text-[#06201a] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Printer className="h-4 w-4" />
                  چاپ
                </button>
                {preview ? <a
                  href={preview.url}
                  download={preview.filename}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#36c3b2] px-3 text-sm font-bold text-white"
                >
                  <Download className="h-4 w-4" />
                  دانلود PDF
                </a> : null}
              </div>
              {downloadError ? (
                <div className="px-4 py-3 text-center">
                  <p role="alert" className="text-sm leading-6 text-[#f3a0a7]">
                    {downloadError}
                  </p>
                  {!preview ? (
                    <button
                      type="button"
                      onClick={handleDownloadPaymentReceipt}
                      disabled={isDownloading}
                      className="mt-3 rounded-lg border border-[#36c3b2] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                    >
                      تلاش دوباره
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-white">
                {preview ? (
                  <iframe
                    ref={previewFrameRef}
                    title="پیش‌نمایش قبض پرداخت"
                    src={preview.url}
                    onLoad={() => setIsPreviewReady(true)}
                    className="h-full w-full border-0"
                  />
                ) : null}
                {isDownloading || (preview && !isPreviewReady) ? (
                  <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white text-[#06201a]">
                    <LoaderCircle className="h-7 w-7 animate-spin" />
                    <p className="text-sm">در حال آماده‌سازی قبض...</p>
                  </div>
                ) : null}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
