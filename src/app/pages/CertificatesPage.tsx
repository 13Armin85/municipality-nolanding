import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft, ArrowRight, CalendarDays, Download, ExternalLink, FileCheck2,
  FileText, FolderOpen, Hash, Home, LoaderCircle, Printer, RefreshCw, Search, X,
} from "lucide-react";
import { Header } from "../components/Header";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  certificateFileName, certificatePdfBlob, fetchCertificates, type Certificate,
} from "../data/certificates";
import "./certificates.css";

const normalizeSearch = (value: string) => value
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\s\u200c]+/g, " ").trim().toLowerCase();

function CertificatePreview({ certificate, onClose }: { certificate: Certificate; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isPdfReady, setIsPdfReady] = useState(false);
  const [printError, setPrintError] = useState("");
  const pdfFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let objectUrl = "";
    try {
      objectUrl = URL.createObjectURL(certificatePdfBlob(certificate.pdf));
      setUrl(objectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "نمایش گواهی انجام نشد.");
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [certificate]);

  const printCertificate = () => {
    if (!isPdfReady || !pdfFrame.current?.contentWindow) return;
    setPrintError("");
    try {
      pdfFrame.current.contentWindow.focus();
      pdfFrame.current.contentWindow.print();
    } catch {
      setPrintError("مرورگر شما چاپ مستقیم را پشتیبانی نمی‌کند. فایل را با دکمه «باز کردن فایل» باز کنید و از گزینه چاپ استفاده کنید.");
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="certificate-dialog" dir="rtl">
        <DialogHeader className="certificate-dialog-heading">
          <div>
            <DialogTitle>{certificate.type}</DialogTitle>
            <DialogDescription>
              پرونده <bdi>{certificate.fileId || "ثبت نشده"}</bdi>
              {" · "}درخواست <bdi>{certificate.requestId || "ثبت نشده"}</bdi>
            </DialogDescription>
          </div>
          {url && <div className="certificate-preview-actions">
            <button type="button" onClick={printCertificate} disabled={!isPdfReady} className="certificate-button">
              <Printer size={16} aria-hidden="true" />چاپ گواهی
            </button>
            <a href={url} download={certificateFileName(certificate)} className="certificate-button certificate-button--primary">
              <Download size={16} aria-hidden="true" />دانلود PDF
            </a>
            <a href={url} target="_blank" rel="noopener noreferrer" className="certificate-button">
              <ExternalLink size={16} aria-hidden="true" />باز کردن فایل
            </a>
          </div>}
        </DialogHeader>
        {error ? <div role="alert" className="certificate-state certificate-state--error"><FileText size={32} /><p>{error}</p></div>
          : url ? <iframe ref={pdfFrame} src={url} onLoad={() => setIsPdfReady(true)} title={`${certificate.type}، پرونده ${certificate.fileId}`} className="certificate-pdf" />
          : <div role="status" className="certificate-state"><LoaderCircle className="animate-spin" /><p>در حال آماده‌سازی گواهی…</p></div>}
        {printError && <p role="alert" className="certificate-card-error">{printError}</p>}
        {url && <p className="certificate-preview-hint">گواهی را در همین پنجره ببینید، با «چاپ گواهی» چاپ کنید یا با «دانلود PDF» دریافت کنید. برای ذخیره از پنجره چاپ، گزینه «Save as PDF» را انتخاب کنید. اگر پیش‌نمایش نمایش داده نمی‌شود، «باز کردن فایل» را بزنید.</p>}
      </DialogContent>
    </Dialog>
  );
}

export function CertificatesPage({ isDark, toggleTheme }: { isDark: boolean; toggleTheme: () => void }) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [sort, setSort] = useState("newest");
  const [preview, setPreview] = useState<Certificate | null>(null);
  const [downloadError, setDownloadError] = useState<{ id: string; message: string } | null>(null);
  const downloadUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "گواهی‌ها | شهروندیار";
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    const urls = downloadUrls.current;
    return () => { urls.forEach((timer, url) => { clearTimeout(timer); URL.revokeObjectURL(url); }); urls.clear(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError("");
    setPreview(null);
    setDownloadError(null);
    fetchCertificates(controller.signal).then(items => {
      if (controller.signal.aborted) return;
      setCertificates(items);
      setSelectedType(current => current && items.some(item => item.type === current) ? current : null);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "دریافت گواهی‌ها انجام نشد.");
    }).finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const types = useMemo(() => [...new Set(certificates.map(item => item.type))], [certificates]);
  const filtered = useMemo(() => {
    const search = normalizeSearch(query);
    return certificates.filter(item => (!selectedType || item.type === selectedType) &&
      (!search || normalizeSearch([item.type, item.fileId, item.requestId, item.dateOfIssue].join(" ")).includes(search)))
      .sort((a, b) => {
        if (!a.dateOfIssue) return b.dateOfIssue ? 1 : 0;
        if (!b.dateOfIssue) return -1;
        const comparison = normalizeSearch(a.dateOfIssue).localeCompare(normalizeSearch(b.dateOfIssue), "en", { numeric: true });
        return sort === "newest" ? -comparison : comparison;
      });
  }, [certificates, query, selectedType, sort]);

  const download = (certificate: Certificate) => {
    setDownloadError(null);
    try {
      const url = URL.createObjectURL(certificatePdfBlob(certificate.pdf));
      const link = document.createElement("a");
      link.href = url;
      link.download = certificateFileName(certificate);
      document.body.append(link);
      link.click();
      link.remove();
      downloadUrls.current.set(url, setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 60_000));
    } catch (cause) {
      setDownloadError({ id: certificate.id, message: cause instanceof Error ? cause.message : "دانلود فایل انجام نشد." });
    }
  };

  return (
    <>
      <Header isDark={isDark} toggleTheme={toggleTheme} />
      <main className="certificates-page" dir="rtl">
        <div className="certificates-container">
          <nav className="certificates-breadcrumb" aria-label="مسیر صفحه">
            <Link to="/"><Home size={15} aria-hidden="true" />صفحه اصلی</Link>
            <ArrowLeft size={13} aria-hidden="true" /><span aria-current="page">گواهی‌ها</span>
          </nav>

          <section className="certificates-hero" aria-labelledby="certificates-title">
            <div className="certificates-hero-copy">
              <span className="certificates-eyebrow"><span />اسناد صادرشده</span>
              <h1 id="certificates-title">گواهی‌های صادرشده،<br /><span>همیشه در دسترس</span></h1>
              <p>پروانه‌های ساختمان، گواهی پایانکار و پاسخ استعلام‌ها را یکجا ببینید و نسخه اصلی آن‌ها را دریافت کنید.</p>
              <Link to="/#services" className="certificates-back"><ArrowRight size={15} />بازگشت به خدمات</Link>
            </div>
            <div className="certificates-hero-summary">
              <div className="certificates-hero-icon"><FileCheck2 size={42} strokeWidth={1.4} aria-hidden="true" /></div>
              <p>{isLoading || error ? "—" : certificates.length.toLocaleString("fa-IR")}</p>
              <span>گواهی در سامانه</span>
            </div>
          </section>

          <section className="certificates-library" aria-labelledby="certificates-library-title">
            <div className="certificates-library-heading">
              <div><h2 id="certificates-library-title">فهرست گواهی‌ها</h2><p>اطلاعات هر گواهی و فایل اصلی PDF</p></div>
              <button type="button" className="certificate-button" onClick={() => setAttempt(value => value + 1)} disabled={isLoading}>
                <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />به‌روزرسانی
              </button>
            </div>
            <div className="certificates-toolbar">
              <div className="certificates-search">
                <Search size={18} aria-hidden="true" />
                <input type="search" aria-label="جستجوی گواهی‌ها" placeholder="جستجو با نوع گواهی، شماره پرونده یا درخواست…" value={query} onChange={event => setQuery(event.target.value)} />
                {query && <button type="button" aria-label="پاک کردن جستجو" onClick={() => setQuery("")}><X size={16} /></button>}
              </div>
              <label className="certificates-sort"><span>ترتیب نمایش</span><select value={sort} onChange={event => setSort(event.target.value)}>
                <option value="newest">جدیدترین صدور</option><option value="oldest">قدیمی‌ترین صدور</option>
              </select></label>
            </div>
            {types.length > 0 && <div className="certificates-filters" role="group" aria-label="فیلتر نوع گواهی">
              <button type="button" aria-pressed={selectedType === null} onClick={() => setSelectedType(null)}>همه گواهی‌ها <span>{certificates.length.toLocaleString("fa-IR")}</span></button>
              {types.map(type => <button key={type} type="button" aria-pressed={selectedType === type} onClick={() => setSelectedType(type)}>{type}<span>{certificates.filter(item => item.type === type).length.toLocaleString("fa-IR")}</span></button>)}
            </div>}

            {isLoading ? <div role="status" className="certificate-state"><LoaderCircle size={32} className="animate-spin" /><h3>در حال دریافت گواهی‌ها…</h3><p>لطفاً چند لحظه منتظر بمانید.</p></div>
              : error ? <div role="alert" className="certificate-state certificate-state--error"><FileText size={36} /><h3>گواهی‌ها دریافت نشدند</h3><p>{error}</p><button type="button" className="certificate-button" onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</button></div>
              : certificates.length === 0 ? <div className="certificate-state"><FolderOpen size={40} /><h3>هنوز گواهی‌ای ثبت نشده است</h3><p>پس از صدور، گواهی‌ها در این بخش نمایش داده می‌شوند.</p></div>
              : filtered.length === 0 ? <div className="certificate-state"><Search size={36} /><h3>گواهی‌ای با این مشخصات پیدا نشد</h3><p>عبارت جستجو یا فیلتر انتخاب‌شده را تغییر دهید.</p><button type="button" className="certificate-button" onClick={() => { setQuery(""); setSelectedType(null); }}>نمایش همه گواهی‌ها</button></div>
              : <>
                <p role="status" className="certificates-result-count">نمایش {filtered.length.toLocaleString("fa-IR")} گواهی از {certificates.length.toLocaleString("fa-IR")} گواهی</p>
                <div className="certificates-grid">
                  {filtered.map(certificate => <article key={certificate.id} className="certificate-card">
                    <div className="certificate-card-top"><span className="certificate-card-icon"><FileCheck2 size={24} strokeWidth={1.6} aria-hidden="true" /></span><span className="certificate-file-badge">PDF</span></div>
                    <h3>{certificate.type}</h3>
                    <dl className="certificate-metadata">
                      <div><dt><FolderOpen size={14} aria-hidden="true" />شماره پرونده</dt><dd><bdi>{certificate.fileId || "ثبت نشده"}</bdi></dd></div>
                      <div><dt><Hash size={14} aria-hidden="true" />شماره درخواست</dt><dd><bdi>{certificate.requestId || "ثبت نشده"}</bdi></dd></div>
                      <div className="certificate-issued"><dt><CalendarDays size={14} aria-hidden="true" />تاریخ صدور</dt><dd><bdi dir="ltr">{certificate.dateOfIssue || "ثبت نشده"}</bdi></dd></div>
                    </dl>
                    <div className="certificate-card-actions">
                      <button type="button" className="certificate-button certificate-button--primary" onClick={() => setPreview(certificate)} disabled={!certificate.pdf} aria-label={`مشاهده ${certificate.type} پرونده ${certificate.fileId}`}><FileText size={16} aria-hidden="true" />مشاهده گواهی</button>
                      <button type="button" className="certificate-button" onClick={() => download(certificate)} disabled={!certificate.pdf} aria-label={`دانلود ${certificate.type} پرونده ${certificate.fileId}`}><Download size={16} aria-hidden="true" />دانلود</button>
                    </div>
                    {!certificate.pdf && <p className="certificate-card-error">فایل این گواهی هنوز در دسترس نیست.</p>}
                    {downloadError?.id === certificate.id && <p role="alert" className="certificate-card-error">{downloadError.message}</p>}
                  </article>)}
                </div>
              </>}
          </section>
        </div>
      </main>
      {preview && <CertificatePreview key={preview.id} certificate={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
