import React from "react";
import { createRoot } from "react-dom/client";
import { Activity, CalendarDays, ChartNoAxesCombined, CircleDollarSign, Database, ReceiptText } from "lucide-react";
import "./styles.css";

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function App() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 29);
  const [dateFrom, setDateFrom] = React.useState(formatDate(start));
  const [dateTo, setDateTo] = React.useState(formatDate(today));

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DMMR POS home">
          <span className="brand-mark">D</span>
          <span><strong>DMMR POS</strong><small>SALES ANALYTICS</small></span>
        </a>
        <div className="connection"><span className="status-dot" /> Analytics workspace</div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">LOYVERSE · BUSINESS INTELLIGENCE</p>
          <h1>Sales overview</h1>
          <p className="subheading">Pantau penjualan dan performa produk dalam rentang tanggal pilihanmu.</p>
        </div>
        <div className="date-filter">
          <label><CalendarDays size={15} /> Dari <input aria-label="Tanggal mulai" type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} /></label>
          <span className="date-separator">—</span>
          <label>Sampai <input aria-label="Tanggal akhir" type="date" value={dateTo} min={dateFrom} max={formatDate(today)} onChange={e => setDateTo(e.target.value)} /></label>
        </div>
      </section>

      <section className="metric-grid" aria-label="Ringkasan penjualan">
        <Metric icon={<CircleDollarSign />} label="Total omzet" value="—" note="Menunggu koneksi database" />
        <Metric icon={<ReceiptText />} label="Transaksi" value="—" note="Menunggu koneksi database" />
        <Metric icon={<ChartNoAxesCombined />} label="Rata-rata transaksi" value="—" note="Menunggu koneksi database" />
        <Metric icon={<Activity />} label="Item terjual" value="—" note="Menunggu koneksi database" />
      </section>

      <section className="content-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><h2>Tren penjualan</h2><p>Omzet harian dalam rentang terpilih</p></div><span className="panel-icon"><ChartNoAxesCombined size={18} /></span></div>
          <div className="empty-chart"><div className="empty-icon"><Database size={24} /></div><strong>Database belum terhubung</strong><p>Setelah Supabase siap dan arsip Loyverse diimpor, grafik penjualan akan tampil di sini.</p></div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><h2>Produk teratas</h2><p>Berdasarkan omzet</p></div></div>
          <div className="empty-list">Data produk akan muncul setelah impor selesai.</div>
        </article>
      </section>

      <section className="panel transactions-panel">
        <div className="panel-heading"><div><h2>Transaksi terbaru</h2><p>Transaksi dalam periode pilihan</p></div><span className="muted-tag">Preview UI</span></div>
        <div className="table-empty"><ReceiptText size={22} /><span>Belum ada data transaksi yang dimuat.</span></div>
      </section>
      <footer> DMMR POS <span>·</span> Loyverse analytics <span>·</span> Data akan tampil setelah koneksi Supabase dikonfigurasi.</footer>
    </main>
  );
}

function Metric({ icon, label, value, note }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span></div><strong className="metric-value">{value}</strong><p>{note}</p></article>;
}

createRoot(document.getElementById("root")).render(<App />);
