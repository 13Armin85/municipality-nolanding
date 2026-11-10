import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, CreditCard,
  FileText, Home, Info, LoaderCircle, MapPin, ShieldCheck, UserRound,
  XCircle,
} from "lucide-react";
import { Header } from "../components/Header";
import {
  getReceiptPaymentStatus, getReceiptTotal, readReceiptParams,
  type ReceiptDetails,
} from "../data/receipt";
import {
  extractPaymentIdentifiers, redirectToPaymentGateway, requestPaymentToken,
} from "../services/paymentService";
import { canRefreshReceipt, fetchReceiptDetails } from "../data/receiptInquiry";
import "./receipt.css";

interface ReceiptPageProps {
  isDark: boolean;
  toggleTheme: () => void;
}

const money = (value: number | null) => value === null ? "—" : value.toLocaleString("fa-IR");
const display = (value: string) => value || "ثبت نشده";

function Detail({ label, value, numeric = false }: {
  label: string; value: string; numeric?: boolean;
}) {
  return (
    <div className="receipt-detail">
      <dt>{label}</dt>
      <dd><bdi dir={numeric ? "ltr" : "auto"}>{display(value)}</bdi></dd>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <h2 className="receipt-section-title"><span aria-hidden="true">{icon}</span>{children}</h2>;
}

function ReceiptContent({ receipt, isRefreshing }: { receipt: ReceiptDetails; isRefreshing: boolean }) {
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const paymentAttempt = useRef(0);
  const paymentInFlight = useRef(false);
  const status = getReceiptPaymentStatus(receipt.PaymentStatus);
  const isPaid = status === "paid";
  const identifiers = extractPaymentIdentifiers(receipt);
  const total = getReceiptTotal(receipt);
  const paymentIssue = isRefreshing
    ? "در حال دریافت آخرین اطلاعات قبض…"
    : isPaid
    ? "این قبض قبلاً پرداخت شده است و نیازی به پرداخت دوباره ندارد."
    : status === "unknown"
      ? "وضعیت پرداخت در لینک مشخص نیست؛ لطفاً قبض را دوباره استعلام کنید."
      : !identifiers
        ? "شناسه قبض یا شناسه پرداخت معتبر نیست؛ لطفاً قبض را دوباره استعلام کنید."
        : total === null || total <= 0
          ? "مبلغ قابل پرداخت معتبر نیست؛ لطفاً قبض را دوباره استعلام کنید."
          : "";

  useEffect(() => () => { paymentAttempt.current += 1; }, []);

  const handlePayment = async () => {
    if (paymentInFlight.current || paymentIssue || !identifiers) return;

    paymentInFlight.current = true;
    setIsPaying(true);
    setPaymentError("");
    const attempt = ++paymentAttempt.current;
    try {
      // Amount and payment eligibility are checked by the existing payment API.
      // Query parameters are only used for display and selecting the bill.
      const { refId, redirectUrl } = await requestPaymentToken(identifiers);
      if (attempt !== paymentAttempt.current) return;
      redirectToPaymentGateway(refId, redirectUrl);
    } catch (error) {
      if (attempt !== paymentAttempt.current) return;
      setPaymentError(error instanceof Error ? error.message : "شروع پرداخت انجام نشد؛ دوباره تلاش کنید.");
      paymentInFlight.current = false;
      setIsPaying(false);
    }
  };

  return (
    <article className="receipt-paper" aria-labelledby="receipt-title">
      <div className="receipt-paper-heading">
        <div className="receipt-heading-icon" aria-hidden="true"><FileText size={28} /></div>
        <div className="receipt-heading-copy">
          <p className="receipt-eyebrow">پرتال خدمات الکترونیک شهروندیار</p>
          <h1 id="receipt-title">قبض عوارض شهری</h1>
          <p className="receipt-subtitle">{receipt.Description || "جزئیات قبض و پرداخت عوارض"}</p>
        </div>
        <span className={`receipt-status receipt-status--${status}`}>
          {isPaid ? <CheckCircle2 size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}
          {isPaid ? "پرداخت‌شده" : status === "unpaid" ? "در انتظار پرداخت" : "وضعیت نامشخص"}
        </span>
      </div>

      <div className="receipt-meta-strip">
        <span>سال عملکرد <bdi dir="ltr">{display(receipt.Year)}</bdi></span>
        <span>تاریخ صدور <bdi dir="ltr">{display(receipt.DateSodor)}</bdi></span>
      </div>

      <div className="receipt-paper-body">
        <section aria-labelledby="receipt-owner-heading">
          <SectionTitle icon={<UserRound size={18} />}><span id="receipt-owner-heading">اطلاعات مالک و ملک</span></SectionTitle>
          <dl className="receipt-details-grid">
            <Detail label="نام مالک" value={receipt.NameOwner === "بدون نام" ? "" : receipt.NameOwner} />
            <Detail label="شناسه مالک" value={receipt.IdMalek} numeric />
            <Detail label="شماره پرونده" value={receipt.ParvandeNo} numeric />
            <Detail label="کد نوسازی" value={receipt.CodeNosazi} numeric />
          </dl>
          <div className="receipt-address">
            <MapPin size={18} aria-hidden="true" />
            <div><p>نشانی ملک</p><p>{display(receipt.Address)}</p></div>
          </div>
          <dl className="receipt-description"><Detail label="شرح قبض" value={receipt.Description} /></dl>
        </section>

        <section className="receipt-identifiers-section" aria-labelledby="receipt-identifiers-heading">
          <SectionTitle icon={<FileText size={18} />}><span id="receipt-identifiers-heading">شناسه‌های قبض</span></SectionTitle>
          <dl className="receipt-identifiers">
            <Detail label="شناسه قبض" value={receipt.ShenaseGhabz} numeric />
            <Detail label="شناسه پرداخت" value={receipt.ShenasePardakht} numeric />
          </dl>
        </section>

        <section className="receipt-financials" aria-labelledby="receipt-financials-heading">
          <SectionTitle icon={<CreditCard size={18} />}><span id="receipt-financials-heading">جزئیات مبلغ</span></SectionTitle>
          <dl className="receipt-amount-rows">
            <div><dt>مبلغ عوارض</dt><dd>{money(receipt.Price)} <small>ریال</small></dd></div>
            <div><dt>دیرکرد</dt><dd>{money(receipt.DelayedPrice)} <small>ریال</small></dd></div>
          </dl>
        </section>
      </div>

      <div className="receipt-payment-section">
        <div className="receipt-total">
          <div><p>{isPaid ? "مبلغ کل قبض" : "مبلغ قابل پرداخت"}</p><span>مجموع عوارض و دیرکرد</span></div>
          <p><strong>{money(total)}</strong> <span>ریال</span></p>
        </div>
        <button type="button" className="receipt-pay-button" onClick={handlePayment}
          disabled={Boolean(paymentIssue) || isPaying} aria-busy={isPaying} aria-describedby="receipt-payment-hint">
          {isPaying ? <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
            : isPaid ? <CheckCircle2 size={20} aria-hidden="true" /> : <CreditCard size={20} aria-hidden="true" />}
          {isPaying ? "در حال اتصال به درگاه…" : isPaid ? "قبض پرداخت شده است" : "پرداخت قبض"}
          {!isPaid && !isPaying && <ArrowLeft size={18} className="receipt-pay-arrow" aria-hidden="true" />}
        </button>
        {paymentError && <p role="alert" className="receipt-payment-error">{paymentError}</p>}
        <p id="receipt-payment-hint" className="receipt-payment-hint">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>{paymentIssue || "با انتخاب پرداخت، به درگاه امن آسان‌پرداخت منتقل می‌شوید."}</span>
        </p>
      </div>
    </article>
  );
}

function ReceiptLookup({ params }: { params: URLSearchParams }) {
  const [initialResult] = useState(() => readReceiptParams(params));
  const [result, setResult] = useState(initialResult);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">(() =>
    initialResult.success && canRefreshReceipt(initialResult.receipt) ? "loading" : "ready");
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    if (!initialResult.success || !canRefreshReceipt(initialResult.receipt)) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setState("loading");
    setRefreshError("");
    fetchReceiptDetails(initialResult.receipt, controller.signal).then((receipt) => {
      if (!active) return;
      setResult({ ...initialResult, receipt });
      setState("ready");
    }).catch(() => {
      if (!active) return;
      setRefreshError("به‌روزرسانی اطلاعات قبض انجام نشد؛ اطلاعات موجود در لینک نمایش داده می‌شود.");
      setState("error");
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [initialResult, attempt]);

  if (!result.success) return (
    <section className="receipt-paper receipt-error" aria-labelledby="receipt-error-title">
      <div className="receipt-error-icon"><XCircle size={38} aria-hidden="true" /></div>
      <p className="receipt-eyebrow">مشاهده قبض عوارض شهری</p>
      <h1 id="receipt-error-title">دریافت اطلاعات قبض ناموفق بود</h1>
      <p role="alert" className="receipt-error-message">{result.message}</p>
      <p className="receipt-error-help">برای بررسی و دریافت دوباره قبض، به بخش عوارض نوسازی مراجعه کنید.</p>
      <div className="receipt-error-actions">
        <Link to="/modern-toll" className="receipt-pay-button"><FileText size={18} aria-hidden="true" />استعلام دوباره قبض</Link>
        <Link to="/" className="receipt-back-link"><ArrowRight size={16} aria-hidden="true" />بازگشت به صفحه اصلی</Link>
      </div>
    </section>
  );

  return (
    <>
      <div className="receipt-intro" role="status"><span className="receipt-intro-line" /><span>
        {state === "loading" ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
        {state === "loading" ? "در حال دریافت آخرین اطلاعات قبض…" : "اطلاعات قبض دریافت شد"}
      </span></div>
      {result.message && <p role="status" className="receipt-query-message">{result.message}</p>}
      {refreshError && <div className="receipt-query-message" role="status">
        <p>{refreshError}</p>
        <button type="button" className="receipt-back-link" onClick={() => { setState("loading"); setAttempt((value) => value + 1); }}>تلاش دوباره</button>
      </div>}
      <ReceiptContent key={`${attempt}:${state}`} receipt={result.receipt} isRefreshing={state === "loading"} />
    </>
  );
}

export function ReceiptPage({ isDark, toggleTheme }: ReceiptPageProps) {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "قبض عوارض شهری | شهروندیار";
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <>
      <Header isDark={isDark} toggleTheme={toggleTheme} stayOnLogin />
      <main className="receipt-page">
        <div className="receipt-container">
          <nav className="receipt-breadcrumb" aria-label="مسیر صفحه">
            <Link to="/"><Home size={15} aria-hidden="true" />صفحه اصلی</Link>
            <ArrowLeft size={13} aria-hidden="true" /><span aria-current="page">مشاهده قبض</span>
          </nav>

          <ReceiptLookup key={searchParams.toString()} params={searchParams} />

          <div className="receipt-page-footer"><Building2 size={17} aria-hidden="true" /><span>شهروندیار · خدمات شهری، ساده و در دسترس</span></div>
        </div>
      </main>
    </>
  );
}
