import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { reportsApi } from "../api.js";
import { useCompanyProfile } from "../companySettings.jsx";
import { formatMoney, safeFileSegment } from "../util.js";
import {
  buildMonthlyReportHtml,
  buildYearlyReportHtml,
  printReportFromHtml,
  downloadReportWord,
} from "../reportExport.js";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleString("default", { month: "long" }),
}));

function StatCard({ label, value, hint, tone = "default" }) {
  return (
    <div className={`reportStat ${tone !== "default" ? tone : ""}`}>
      <div className="reportStatLabel">{label}</div>
      <div className="reportStatValue">{value}</div>
      {hint ? <div className="reportStatHint">{hint}</div> : null}
    </div>
  );
}

function DebtorsTable({ rows, showPhone = true }) {
  if (!rows?.length) {
    return <p style={{ color: "var(--muted)", margin: 0 }}>No customers owe money right now.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            {showPhone ? <th>Phone</th> : null}
            <th>Balance owed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c._id}>
              <td>
                <Link to={`/customers/${c._id}`}>{c.fullName}</Link>
              </td>
              {showPhone ? <td>{c.phone || "—"}</td> : null}
              <td>{formatMoney(c.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const { profile } = useCompanyProfile();
  const now = new Date();
  const [tab, setTab] = useState("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [yearlyYear, setYearlyYear] = useState(now.getFullYear());
  const [monthly, setMonthly] = useState(null);
  const [yearly, setYearly] = useState(null);
  const [err, setErr] = useState("");
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadingYear, setLoadingYear] = useState(true);

  useEffect(() => {
    setErr("");
    setLoadingMonth(true);
    reportsApi
      .monthly(year, month)
      .then(setMonthly)
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingMonth(false));
  }, [year, month]);

  useEffect(() => {
    setErr("");
    setLoadingYear(true);
    reportsApi
      .yearly(yearlyYear)
      .then(setYearly)
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingYear(false));
  }, [yearlyYear]);

  const monthLabel = MONTHS.find((m) => m.value === month)?.label || "";
  const monthLabels = MONTHS.map((m) => m.label);
  const periodMonthLabel = monthly?.period?.label || `${year}-${String(month).padStart(2, "0")}`;

  function printMonthly() {
    if (!monthly) return;
    const html = buildMonthlyReportHtml(monthly, profile, { monthLabel, year });
    printReportFromHtml(html);
  }

  function printYearly() {
    if (!yearly) return;
    const html = buildYearlyReportHtml(yearly, profile, { year: yearlyYear, monthLabels });
    printReportFromHtml(html);
  }

  function downloadMonthlyWord() {
    if (!monthly) return;
    const html = buildMonthlyReportHtml(monthly, profile, { monthLabel, year });
    downloadReportWord(html, `${safeFileSegment(profile.brandName)}-report-${periodMonthLabel}.doc`);
  }

  function downloadYearlyWord() {
    if (!yearly) return;
    const html = buildYearlyReportHtml(yearly, profile, { year: yearlyYear, monthLabels });
    downloadReportWord(html, `${safeFileSegment(profile.brandName)}-report-${yearlyYear}.doc`);
  }

  return (
    <div className="reportsPage">
      <h1 style={{ marginTop: 0 }}>Reports</h1>
      <p style={{ color: "var(--muted)", marginTop: "-0.25rem", maxWidth: 560 }}>
        On-screen summary for quick viewing. Use <strong>Print report</strong> for a formal company letter (like a bank statement).
      </p>

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <div className="reportTabs">
        <button type="button" className={`reportTab ${tab === "month" ? "isActive" : ""}`} onClick={() => setTab("month")}>
          Monthly
        </button>
        <button type="button" className={`reportTab ${tab === "year" ? "isActive" : ""}`} onClick={() => setTab("year")}>
          Yearly
        </button>
      </div>

      {tab === "month" && (
        <div className="card">
          <div className="reportPeriodRow">
            <div>
              <label htmlFor="rep-year">Year</label>
              <input id="rep-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }} />
            </div>
            <div>
              <label htmlFor="rep-month">Month</label>
              <select id="rep-month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingMonth ? (
            <p style={{ color: "var(--muted)" }}>Loading…</p>
          ) : monthly ? (
            <>
              <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
                <strong style={{ color: "var(--text)" }}>{monthLabel} {year}</strong>
                {" · "}
                {monthly.transactionCounts?.invoices ?? 0} invoice
                {(monthly.transactionCounts?.invoices ?? 0) === 1 ? "" : "s"}
              </p>

              <div className="reportStatGrid">
                <StatCard
                  tone="accent"
                  label="Money received"
                  value={formatMoney(monthly.totalMoneyReceived ?? 0)}
                  hint="Cash at sale + payments recorded this month"
                />
                <StatCard
                  label="Total sales"
                  value={formatMoney(monthly.totalSales ?? 0)}
                  hint="All invoice totals this month"
                />
                <StatCard
                  label="Credit given"
                  value={formatMoney(monthly.totalCreditGiven ?? 0)}
                  hint="New debt added this month"
                />
              </div>

              <div className="reportStatGrid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <StatCard label="Cash at sale" value={formatMoney(monthly.totalPaidAtSale ?? 0)} hint="Paid when invoice was created" />
                <StatCard label="Payments later" value={formatMoney(monthly.totalPaymentsRecorded ?? 0)} hint="Recorded on customer page" />
                <StatCard
                  tone="danger"
                  label="Still owed (today)"
                  value={formatMoney(monthly.totalOutstandingBalance ?? 0)}
                  hint="All customers — current balance"
                />
              </div>

              <h2 className="reportSectionTitle">Customers who owe</h2>
              <DebtorsTable rows={monthly.customersWhoOwe} />

              <div className="reportActions no-print">
                <button type="button" className="btn btn-primary" onClick={printMonthly}>
                  Print report
                </button>
                <button type="button" className="btn btn-ghost" onClick={downloadMonthlyWord}>
                  Download Word
                </button>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", alignSelf: "center" }}>
                  Print opens a formal letter with your company header — choose &quot;Save as PDF&quot; in the print dialog if needed.
                </span>
              </div>
            </>
          ) : null}
        </div>
      )}

      {tab === "year" && (
        <div className="card">
          <div className="reportPeriodRow">
            <div>
              <label htmlFor="rep-yearly">Year</label>
              <input
                id="rep-yearly"
                type="number"
                value={yearlyYear}
                onChange={(e) => setYearlyYear(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
          </div>

          {loadingYear ? (
            <p style={{ color: "var(--muted)" }}>Loading…</p>
          ) : yearly ? (
            <>
              <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
                <strong style={{ color: "var(--text)" }}>{yearly.year}</strong>
                {" · "}
                {yearly.transactionCounts?.invoices ?? 0} invoice
                {(yearly.transactionCounts?.invoices ?? 0) === 1 ? "" : "s"} this year
              </p>

              <div className="reportStatGrid">
                <StatCard
                  tone="accent"
                  label="Money received"
                  value={formatMoney(yearly.yearlyMoneyReceived ?? 0)}
                  hint="Cash at sale + payments recorded this year"
                />
                <StatCard label="Total sales" value={formatMoney(yearly.yearlyTotalSales ?? 0)} hint="All invoice totals" />
                <StatCard label="Credit given" value={formatMoney(yearly.yearlyCreditTotal ?? 0)} hint="New debt added this year" />
              </div>

              <div className="reportStatGrid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <StatCard label="Cash at sale" value={formatMoney(yearly.yearlyTotalPaidAtSale ?? 0)} />
                <StatCard label="Payments later" value={formatMoney(yearly.yearlyPaymentsRecorded ?? 0)} />
              </div>

              <h2 className="reportSectionTitle">Top customers who owe</h2>
              <DebtorsTable rows={yearly.biggestDebtors} showPhone={false} />

              {yearly.salesTrendsByMonth?.length > 0 && (
                <>
                  <h2 className="reportSectionTitle" style={{ marginTop: "1.5rem" }}>
                    Sales by month
                  </h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Sales</th>
                          <th>Cash at sale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearly.salesTrendsByMonth.map((row) => (
                          <tr key={row.month}>
                            <td>{MONTHS[row.month - 1]?.label || row.month}</td>
                            <td>{formatMoney(row.totalSales ?? 0)}</td>
                            <td>{formatMoney(row.paidAtSale ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="reportActions no-print">
                <button type="button" className="btn btn-primary" onClick={printYearly}>
                  Print report
                </button>
                <button type="button" className="btn btn-ghost" onClick={downloadYearlyWord}>
                  Download Word
                </button>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", alignSelf: "center" }}>
                  Formal company letter layout — not the dashboard view.
                </span>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
