import { useId, useMemo, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import "./admin-income-chart.css";

const months = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const number = value => Number(value).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
const compactAmount = value => {
  const absolute = Math.abs(value);
  if (absolute >= 1e9) return `${number(value / 1e9)} میلیارد`;
  if (absolute >= 1e6) return `${number(value / 1e6)} میلیون`;
  if (absolute >= 1e3) return `${number(value / 1e3)} هزار`;
  return number(value);
};

function IncomeTooltip({ active, payload }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="admin-income-tooltip" dir="rtl">
      <p>{item.period}</p>
      <div><span className="admin-income-dot" />درآمد ماهانه</div>
      <strong>{item.amount === null ? "مبلغ ثبت نشده" : number(item.amount)}{item.amount !== null && <small> تومان</small>}</strong>
    </div>
  );
}

function MonthTick({ x, y, payload, records }) {
  const item = records[Number(payload.value)];
  if (!item) return null;
  return (
    <text x={x} y={y + 15} textAnchor="middle" fill="var(--muted-foreground)" fontSize={11}>
      <tspan x={x}>{item.monthName}</tspan>
      <tspan x={x} dy={19} fontSize={10}>{item.yearLabel}</tspan>
    </text>
  );
}

export function AdminMonthlyIncomeChart({ records }) {
  const gradientId = `income-${useId().replace(/:/g, "")}`;
  const [selectedIndex, setSelectedIndex] = useState(null);
  const data = useMemo(() => [...records]
    .sort((a, b) => Number(a.year) - Number(b.year) || Number(a.month) - Number(b.month))
    .map((item, index) => {
      const monthName = months[Number(item.month) - 1] || String(item.month);
      const yearLabel = Number(item.year).toLocaleString("fa-IR", { useGrouping: false });
      return {
        ...item,
        index,
        monthName,
        yearLabel,
        period: `${monthName} ${yearLabel}`,
        amount: item.amount !== null && String(item.amount).trim() !== "" && Number.isFinite(Number(item.amount)) ? Number(item.amount) : null,
      };
    }), [records]);
  const total = data.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const selected = data[selectedIndex] ?? data[data.length - 1];
  const selectMonth = state => {
    const item = state?.activePayload?.[0]?.payload;
    if (item) setSelectedIndex(item.index);
  };

  return (
    <section className="admin-income-card" aria-labelledby={gradientId + "-title"}>
      <div className="admin-income-heading">
        <div className="admin-income-heading-copy">
          <span className="admin-income-icon"><ChartNoAxesCombined size={21} aria-hidden="true" /></span>
          <div>
            <h3 id={gradientId + "-title"}>نمودار درآمد ماهانه</h3>
            <p>روند درآمد در تمام دوره‌ها</p>
          </div>
        </div>
        {data.length > 0 && <div className="admin-income-total">
          <span>مجموع درآمد</span>
          <p><strong>{number(total)}</strong><small>تومان</small></p>
        </div>}
      </div>

      {data.length === 0 ? (
        <div className="admin-income-empty"><ChartNoAxesCombined size={36} aria-hidden="true" /><p>داده‌ای برای نمایش درآمد ماهانه وجود ندارد.</p></div>
      ) : (
        <>
          <div className="admin-income-meta">
            <span><i className="admin-income-dot" />درآمد ماهانه <small>(تومان)</small></span>
            <span>{number(data.length)} دوره · {data[0].period}{data.length > 1 && ` تا ${data[data.length - 1].period}`}</span>
          </div>
          <div className="admin-income-scroll" dir="ltr" role="region" aria-label="نمودار تمام دوره‌های درآمد ماهانه؛ برای دیدن ادامه نمودار، افقی پیمایش کنید" tabIndex={0}>
            <div className="admin-income-plot" style={{ minWidth: Math.max(320, data.length * 84 + 88) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 18, right: 18, bottom: 8, left: 6 }} onMouseMove={selectMonth} onMouseDown={selectMonth} accessibilityLayer aria-label="درآمد ماهانه؛ برای بررسی دوره‌ها از کلیدهای جهت‌نما استفاده کنید">
                  <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.5} />
                  </linearGradient></defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 5" vertical={false} />
                  <XAxis dataKey="index" interval={0} tick={<MonthTick records={data} />} tickLine={false} axisLine={false} height={58} />
                  <YAxis tickFormatter={compactAmount} width={78} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} tickMargin={8} />
                  <Tooltip content={<IncomeTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} filterNull={false} isAnimationActive={false} />
                  <Bar dataKey="amount" name="درآمد ماهانه" fill={`url(#${gradientId})`} radius={[7, 7, 0, 0]} maxBarSize={38} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="admin-income-selection" role="status" aria-live="polite">
            <span>درآمد {selected.period}</span>
            <strong>{selected.amount === null ? "مبلغ ثبت نشده" : number(selected.amount)}{selected.amount !== null && <small>تومان</small>}</strong>
          </div>
          <p className="admin-income-hint">برای دیدن مبلغ دقیق، روی ستون هر ماه بروید یا آن را لمس کنید. ادامه دوره‌ها با پیمایش افقی در دسترس است.</p>
        </>
      )}
    </section>
  );
}
