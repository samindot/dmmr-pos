import React from "react";
import { createRoot } from "react-dom/client";
import { Activity, CalendarDays, ChartNoAxesCombined, CircleDollarSign, Database, LogOut, ReceiptText, LockKeyhole, RefreshCw } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import "./styles.css";

const money = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateLabel = value => new Date(value + "T12:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
const todayString = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
};
const shiftDate = (date, days) => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate()+days); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };

function App() {
  const [session, setSession] = React.useState(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState("");
  const [dateTo, setDateTo] = React.useState(todayString());
  const [dateFrom, setDateFrom] = React.useState(shiftDate(todayString(), -29));
  const [loading, setLoading] = React.useState(false);
  const [dataError, setDataError] = React.useState("");
  const [receipts, setReceipts] = React.useState([]);
  const [items, setItems] = React.useState([]);

  React.useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!session || !supabase) { setReceipts([]); setItems([]); return; }
    let cancelled = false;
    async function loadData() {
      setLoading(true); setDataError("");
      const from = new Date(dateFrom + "T00:00:00").toISOString();
      const to = new Date(shiftDate(dateTo, 1) + "T00:00:00").toISOString();
      const { data: receiptRows, error: receiptError } = await supabase
        .from("receipts")
        .select("loyverse_receipt_id, receipt_number, receipt_date, total_money, receipt_type, store_name, employee_name")
        .gte("receipt_date", from).lt("receipt_date", to).order("receipt_date", { ascending: false }).limit(1000);
      if (receiptError) { if (!cancelled) { setDataError(receiptError.message); setLoading(false); } return; }
      const ids = (receiptRows || []).map(r => r.loyverse_receipt_id);
      let itemRows = [];
      if (ids.length) {
        const { data, error } = await supabase.from("sales_items")
          .select("loyverse_receipt_id, item_name, variant_name, quantity, total_money")
          .in("loyverse_receipt_id", ids).limit(1000);
        if (error) { if (!cancelled) { setDataError(error.message); setLoading(false); } return; }
        itemRows = data || [];
      }
      if (!cancelled) { setReceipts(receiptRows || []); setItems(itemRows); setLoading(false); }
    }
    loadData();
    return () => { cancelled = true; };
  }, [session, dateFrom, dateTo]);

  async function signIn(e) {
    e.preventDefault(); setAuthBusy(true); setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setAuthError(error.message);
    setAuthBusy(false);
  }

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!authReady) return <div className="auth-wrap"><div className="auth-card"><span className="brand-mark">D</span><h1>DMMR POS</h1><p>Memeriksa sesi login…</p></div></div>;
  if (!session) return <div className="auth-wrap"><form className="auth-card" onSubmit={signIn}>
    <span className="brand-mark">D</span><p className="eyebrow">LOYVERSE · BUSINESS INTELLIGENCE</p><h1>Masuk ke DMMR POS</h1>
    <p className="auth-description">Dashboard analitik khusus pengguna yang diizinkan.</p>
    <label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
    <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
    {authError && <p className="error-message">{authError}</p>}
    <button className="primary-button" disabled={authBusy}>{authBusy ? "Memproses…" : "Masuk"}</button>
    <p className="auth-footnote">Akun dibuat melalui Supabase Auth. Pendaftaran publik tidak tersedia.</p>
  </form></div>;

  const validReceipts = receipts.filter(r => r.receipt_type !== "REFUND");
  const revenue = validReceipts.reduce((sum,r)=>sum+Number(r.total_money||0),0);
  const quantity = items.reduce((sum,i)=>sum+Number(i.quantity||0),0);
  const dailyMap = {};
  validReceipts.forEach(r => { const day = (r.receipt_date||"").slice(0,10); dailyMap[day]=(dailyMap[day]||0)+Number(r.total_money||0); });
  const daily = Object.entries(dailyMap).sort(([a],[b])=>a.localeCompare(b)).map(([date,total])=>({ date:dateLabel(date), total }));
  const topMap = {};
  items.forEach(i => { const name = i.item_name || "Produk tanpa nama"; topMap[name]=(topMap[name]||0)+Number(i.total_money||0); });
  const topItems = Object.entries(topMap).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([name,total])=>({name,total}));
  const recent = [...receipts].slice(0,12);

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="DMMR POS home"><span className="brand-mark">D</span><span><strong>DMMR POS</strong><small>SALES ANALYTICS</small></span></a>
      <div className="user-actions"><span className="connection"><span className="status-dot connected" /> Terhubung</span><span className="user-email">{session.user.email}</span><button className="icon-button" onClick={()=>supabase.auth.signOut()} aria-label="Keluar"><LogOut size={16}/><span>Keluar</span></button></div>
    </header>
    <section className="page-heading"><div><p className="eyebrow">LOYVERSE · BUSINESS INTELLIGENCE</p><h1>Sales overview</h1><p className="subheading">Pantau penjualan dan performa produk dalam rentang tanggal pilihanmu.</p></div>
      <div className="date-filter"><label><CalendarDays size={15}/> Dari <input aria-label="Tanggal mulai" type="date" value={dateFrom} max={dateTo} onChange={e=>setDateFrom(e.target.value)}/></label><span className="date-separator">—</span><label>Sampai <input aria-label="Tanggal akhir" type="date" value={dateTo} min={dateFrom} max={todayString()} onChange={e=>setDateTo(e.target.value)}/></label></div>
    </section>
    {dataError && <div className="data-alert"><strong>Gagal memuat data.</strong> {dataError} <span>Periksa kebijakan akses Supabase (RLS).</span></div>}
    <section className="metric-grid" aria-label="Ringkasan penjualan">
      <Metric icon={<CircleDollarSign/>} label="Total omzet" value={money(revenue)} note={loading?"Memuat data…":`${validReceipts.length} transaksi non-refund`}/>
      <Metric icon={<ReceiptText/>} label="Transaksi" value={validReceipts.length.toLocaleString("id-ID")} note="Receipt dalam periode terpilih"/>
      <Metric icon={<ChartNoAxesCombined/>} label="Rata-rata transaksi" value={money(validReceipts.length?revenue/validReceipts.length:0)} note="Omzet ÷ jumlah transaksi"/>
      <Metric icon={<Activity/>} label="Item terjual" value={quantity.toLocaleString("id-ID",{maximumFractionDigits:3})} note={loading?"Memuat data…":`${items.length} baris item`}/>
    </section>
    <section className="content-grid">
      <article className="panel chart-panel"><div className="panel-heading"><div><h2>Tren penjualan</h2><p>Omzet harian dalam rentang terpilih</p></div><span className="panel-icon"><ChartNoAxesCombined size={18}/></span></div>
        {daily.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#557563" stopOpacity={0.25}/><stop offset="95%" stopColor="#557563" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0eb"/><XAxis dataKey="date" tick={{fontSize:10,fill:"#7b857e"}} axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>v>=1000000?(v/1000000).toFixed(1)+"jt":v>=1000?(v/1000).toFixed(0)+"rb":v} tick={{fontSize:10,fill:"#7b857e"}} axisLine={false} tickLine={false} width={44}/><Tooltip formatter={v=>money(v)}/><Area type="monotone" dataKey="total" name="Omzet" stroke="#557563" fill="url(#salesFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div> : <Empty icon={<Database size={24}/>} title={loading?"Memuat data…":"Belum ada transaksi"} text="Data akan muncul setelah arsip Loyverse diimpor dan berada dalam rentang tanggal ini."/>}
      </article>
      <article className="panel"><div className="panel-heading"><div><h2>Produk teratas</h2><p>Berdasarkan omzet</p></div></div>
        {topItems.length ? <div className="top-products"><ResponsiveContainer width="100%" height={190}><BarChart data={topItems} layout="vertical" margin={{left:0,right:12,top:4,bottom:4}}><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={105} tick={{fontSize:10,fill:"#647169"}} axisLine={false} tickLine={false}/><Tooltip formatter={v=>money(v)}/><Bar dataKey="total" name="Omzet" fill="#557563" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></div> : <div className="empty-list">Data produk akan muncul setelah impor selesai.</div>}
      </article>
    </section>
    <section className="panel transactions-panel"><div className="panel-heading"><div><h2>Transaksi terbaru</h2><p>Transaksi dalam periode pilihan (maksimal 12 ditampilkan)</p></div><button className="refresh-button" onClick={()=>setDateTo(todayString())}><RefreshCw size={14}/> Perbarui periode</button></div>
      {recent.length ? <div className="table-scroll"><table><thead><tr><th>Tanggal</th><th>No. struk</th><th>Kasir</th><th>Outlet</th><th className="align-right">Total</th></tr></thead><tbody>{recent.map((r,i)=><tr key={r.loyverse_receipt_id||i}><td>{r.receipt_date?new Date(r.receipt_date).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}</td><td>{r.receipt_number||"—"}</td><td>{r.employee_name||"—"}</td><td>{r.store_name||"—"}</td><td className="align-right">{money(r.total_money)}</td></tr>)}</tbody></table></div> : <div className="table-empty"><ReceiptText size={22}/><span>{loading?"Memuat transaksi…":"Belum ada data transaksi yang dimuat."}</span></div>}
    </section>
    <footer>DMMR POS <span>·</span> Loyverse analytics <span>·</span> {loading?"Sinkronisasi tampilan…":"Data dibaca dari Supabase"}</footer>
  </main>;
}

function Metric({icon,label,value,note}) { return <article className="metric-card"><div className="metric-top"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span></div><strong className="metric-value">{value}</strong><p>{note}</p></article>; }
function Empty({icon,title,text}) { return <div className="empty-chart"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{text}</p></div>; }
function SetupScreen() { return <div className="auth-wrap"><div className="auth-card"><span className="brand-mark">D</span><p className="eyebrow">SETUP DIPERLUKAN</p><h1>DMMR POS</h1><p>Konfigurasi Supabase belum dipasang di Cloudflare Pages.</p><ol><li>Buka Settings → Variables and Secrets.</li><li>Tambahkan <code>VITE_SUPABASE_URL</code>.</li><li>Tambahkan <code>VITE_SUPABASE_ANON_KEY</code> menggunakan publishable/anon key.</li><li>Redeploy aplikasi.</li></ol></div></div>; }

createRoot(document.getElementById("root")).render(<App />);
