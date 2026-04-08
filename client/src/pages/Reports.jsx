import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import { reportsApi } from "../api.js";
import { formatMoney } from "../util.js";
import { COMPANY } from "../companyProfile.js";

export default function Reports() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [yearlyYear, setYearlyYear] = useState(now.getFullYear());
  const [monthly, setMonthly] = useState(null);
  const [yearly, setYearly] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    reportsApi
      .monthly(year, month)
      .then(setMonthly)
      .catch((e) => setErr(e.message));
  }, [year, month]);

  useEffect(() => {
    setErr("");
    reportsApi
      .yearly(yearlyYear)
      .then(setYearly)
      .catch((e) => setErr(e.message));
  }, [yearlyYear]);

  function pdfMonthly() {
    if (!monthly) return;
    const doc = new jsPDF();
    let y = 14;
    doc.setFontSize(16);
    doc.text(`${COMPANY.legalName} — Monthly report`, 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Period: ${monthly.period.label}`, 14, y);
    y += 6;
    if (monthly.transactionCounts) {
      const tc = monthly.transactionCounts;
      doc.text(
        `Transactions this month: ${tc.invoices} invoice(s), ${tc.creditEntries} credit entr${tc.creditEntries === 1 ? "y" : "ies"}, ${tc.paymentEntries} payment entr${tc.paymentEntries === 1 ? "y" : "ies"}.`,
        14,
        y
      );
      y += 5;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Sales & money", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`Total sales (invoice totals): ${formatMoney(monthly.totalSales ?? 0)}`, 14, y);
    y += 5;
    doc.text(`Credit given (credit entries in month): ${formatMoney(monthly.totalCreditGiven)}`, 14, y);
    y += 5;
    doc.text(`Paid at sale (cash on invoices in month): ${formatMoney(monthly.totalPaidAtSale ?? 0)}`, 14, y);
    y += 5;
    doc.text(`Payments recorded (Add payment, in month): ${formatMoney(monthly.totalPaymentsRecorded ?? monthly.totalCashReceived ?? 0)}`, 14, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`Total money received (paid at sale + payments): ${formatMoney(monthly.totalMoneyReceived ?? 0)}`, 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(`Outstanding balance (all customers, current): ${formatMoney(monthly.totalOutstandingBalance)}`, 14, y);
    y += 8;
    doc.text("Customers who owe:", 14, y);
    y += 5;
    monthly.customersWhoOwe.forEach((c, i) => {
      if (y > 270) {
        doc.addPage();
        y = 14;
      }
      doc.text(`${i + 1}. ${c.fullName} — ${formatMoney(c.balance)}`, 18, y);
      y += 5;
    });
    doc.save(`samakaab-monthly-${monthly.period.label}.pdf`);
  }

  function pdfYearly() {
    if (!yearly) return;
    const doc = new jsPDF();
    let y = 14;
    doc.setFontSize(16);
    doc.text(`${COMPANY.legalName} — Yearly report`, 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Year: ${yearly.year}`, 14, y);
    y += 6;
    if (yearly.transactionCounts) {
      const tc = yearly.transactionCounts;
      doc.text(
        `Transactions this year: ${tc.invoices} invoice(s), ${tc.creditEntries} credit entr${tc.creditEntries === 1 ? "y" : "ies"}, ${tc.paymentEntries} payment entr${tc.paymentEntries === 1 ? "y" : "ies"}.`,
        14,
        y
      );
      y += 5;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Sales & money (year)", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`Total sales (invoice totals): ${formatMoney(yearly.yearlyTotalSales ?? 0)}`, 14, y);
    y += 5;
    doc.text(`Credit given: ${formatMoney(yearly.yearlyCreditTotal)}`, 14, y);
    y += 5;
    doc.text(`Paid at sale (on invoices): ${formatMoney(yearly.yearlyTotalPaidAtSale ?? 0)}`, 14, y);
    y += 5;
    doc.text(`Payments recorded: ${formatMoney(yearly.yearlyPaymentsRecorded ?? yearly.yearlyIncome ?? 0)}`, 14, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`Total money received (paid at sale + payments): ${formatMoney(yearly.yearlyMoneyReceived ?? 0)}`, 14, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.text("Biggest debtors:", 14, y);
    y += 5;
    yearly.biggestDebtors.forEach((c, i) => {
      if (y > 270) {
        doc.addPage();
        y = 14;
      }
      doc.text(`${i + 1}. ${c.fullName} — ${formatMoney(c.balance)}`, 18, y);
      y += 5;
    });
    doc.save(`samakaab-yearly-${yearly.year}.pdf`);
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Reports</h1>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Monthly</h2>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <label>Year</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div>
            <label>Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString("default", { month: "long" })}
                </option>
              ))}
            </select>
          </div>
        </div>
        {monthly && (
          <>
            <div
              style={{
                display: "grid",
                gap: "0.65rem",
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                background: "var(--bg-soft)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--muted)" }}>Sales & money (this month)</div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.45 }}>
                Each amount is its own kind of activity (not one blended number): invoice sales, credit recorded, cash taken at sale, and payments added later.
                {monthly.transactionCounts && (
                  <>
                    {" "}
                    This month:{" "}
                    <strong>{monthly.transactionCounts.invoices}</strong> invoice(s),{" "}
                    <strong>{monthly.transactionCounts.creditEntries}</strong> credit entr
                    {monthly.transactionCounts.creditEntries === 1 ? "y" : "ies"},{" "}
                    <strong>{monthly.transactionCounts.paymentEntries}</strong> payment entr
                    {monthly.transactionCounts.paymentEntries === 1 ? "y" : "ies"}.
                  </>
                )}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Total sales (all invoices):</strong> {formatMoney(monthly.totalSales ?? 0)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Credit given (credit entries dated this month):</strong> {formatMoney(monthly.totalCreditGiven)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Paid at sale (cash on invoices this month):</strong> {formatMoney(monthly.totalPaidAtSale ?? 0)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Payments recorded (Add payment, this month):</strong>{" "}
                {formatMoney(monthly.totalPaymentsRecorded ?? monthly.totalCashReceived ?? 0)}
              </p>
              <p style={{ margin: 0, fontSize: "1.05rem", paddingTop: "0.25rem", borderTop: "1px solid var(--border)" }}>
                <strong>Total money received:</strong> {formatMoney(monthly.totalMoneyReceived ?? 0)}{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 400 }}>
                  (paid at sale + recorded payments)
                </span>
              </p>
            </div>
            <p>
              <strong>Outstanding balance (all customers, current snapshot):</strong> {formatMoney(monthly.totalOutstandingBalance)}
            </p>
            <h3 style={{ fontSize: "1rem" }}>Customers who owe</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.customersWhoOwe.map((c) => (
                    <tr key={c._id}>
                      <td>
                        <Link to={`/customers/${c._id}`}>{c.fullName}</Link>
                      </td>
                      <td>{c.phone}</td>
                      <td>{formatMoney(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: "0.75rem" }} onClick={pdfMonthly}>
              Download PDF
            </button>
            <button type="button" className="btn" style={{ marginTop: "0.75rem", marginLeft: "0.5rem" }} onClick={() => window.print()}>
              Print
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Yearly</h2>
        <div style={{ marginBottom: "1rem" }}>
          <label>Year</label>
          <input type="number" value={yearlyYear} onChange={(e) => setYearlyYear(Number(e.target.value))} style={{ maxWidth: 120 }} />
        </div>
        {yearly && (
          <>
            <div
              style={{
                display: "grid",
                gap: "0.65rem",
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                background: "var(--bg-soft)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--muted)" }}>Sales & money (full year)</div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.45 }}>
                Same breakdown as monthly: sales, credits, paid at sale, and recorded payments are separate totals.
                {yearly.transactionCounts && (
                  <>
                    {" "}
                    This year:{" "}
                    <strong>{yearly.transactionCounts.invoices}</strong> invoice(s),{" "}
                    <strong>{yearly.transactionCounts.creditEntries}</strong> credit entr
                    {yearly.transactionCounts.creditEntries === 1 ? "y" : "ies"},{" "}
                    <strong>{yearly.transactionCounts.paymentEntries}</strong> payment entr
                    {yearly.transactionCounts.paymentEntries === 1 ? "y" : "ies"}.
                  </>
                )}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Total sales (all invoices):</strong> {formatMoney(yearly.yearlyTotalSales ?? 0)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Credit given:</strong> {formatMoney(yearly.yearlyCreditTotal)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Paid at sale (on invoices):</strong> {formatMoney(yearly.yearlyTotalPaidAtSale ?? 0)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Payments recorded:</strong> {formatMoney(yearly.yearlyPaymentsRecorded ?? yearly.yearlyIncome ?? 0)}
              </p>
              <p style={{ margin: 0, fontSize: "1.05rem", paddingTop: "0.25rem", borderTop: "1px solid var(--border)" }}>
                <strong>Total money received:</strong> {formatMoney(yearly.yearlyMoneyReceived ?? 0)}{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 400 }}>
                  (paid at sale + recorded payments)
                </span>
              </p>
            </div>
            <h3 style={{ fontSize: "1rem" }}>Biggest debtors</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {yearly.biggestDebtors.map((c) => (
                    <tr key={c._id}>
                      <td>
                        <Link to={`/customers/${c._id}`}>{c.fullName}</Link>
                      </td>
                      <td>{formatMoney(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {yearly.salesTrendsByMonth?.length > 0 && (
              <>
                <h3 style={{ fontSize: "1rem" }}>Sales by month (invoice totals)</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Total sales</th>
                        <th>Paid at sale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearly.salesTrendsByMonth.map((row) => (
                        <tr key={row.month}>
                          <td>{new Date(2000, row.month - 1, 1).toLocaleString("default", { month: "long" })}</td>
                          <td>{formatMoney(row.totalSales ?? 0)}</td>
                          <td>{formatMoney(row.paidAtSale ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              Credit and payment trends by month are available from the API for charts.
            </p>
            <button type="button" className="btn btn-primary" style={{ marginTop: "0.75rem" }} onClick={pdfYearly}>
              Download PDF
            </button>
          </>
        )}
      </div>
    </div>
  );
}
