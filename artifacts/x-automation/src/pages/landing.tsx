import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FiZap, FiDownload, FiClock, FiShield, FiTrendingUp, FiLayers, FiCheck, FiArrowRight } from "react-icons/fi";

const features = [
  {
    icon: FiZap,
    title: "Auto Grab Media",
    desc: "Otomatis scrape video & gambar dari timeline, status, dan reply. Tidak perlu manual satu per satu.",
  },
  {
    icon: FiDownload,
    title: "Upload Otomatis",
    desc: "Langsung upload ke Streamtape atau DoodStream secara paralel. Hemat waktu berjam-jam.",
  },
  {
    icon: FiClock,
    title: "Scheduler 24/7",
    desc: "Atur jadwal grab otomatis. Sistem bekerja non-stop bahkan saat kamu tidur.",
  },
  {
    icon: FiShield,
    title: "Smart Extractor",
    desc: "Deteksi video dari link eksternal, redirect chain, dan halaman embed secara otomatis.",
  },
  {
    icon: FiTrendingUp,
    title: "Auto Post & Embed",
    desc: "Posting otomatis ke akun X dengan template kustom. Embed video langsung ke halaman kamu.",
  },
  {
    icon: FiLayers,
    title: "Multi Account",
    desc: "Kelola banyak akun X sekaligus. Rotasi cookie dan proxy untuk menghindari limit.",
  },
];

type PlanData = {
  id: number;
  name: string;
  price: string;
  period: string;
  description: string | null;
  features: string[];
  ctaText: string;
  isPopular: boolean;
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5 },
  }),
};

export default function Landing() {
  const [plans, setPlans] = useState<PlanData[]>([]);

  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((d) => setPlans(d.plans || []))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Hero */}
      <section className="relative px-6 pt-20 pb-24 md:pt-32 md:pb-36 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-transparent to-transparent pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium mb-6">
            <FiZap className="w-3 h-3" />
            Autopilot Content Machine
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Grab, Upload, Post.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              Semuanya Otomatis.
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Berhenti buang waktu download manual. X Automation scrape video & gambar dari X,
            upload ke hosting, dan posting ulang — semua berjalan sendiri 24/7.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#pricing"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
            >
              Lihat Harga <FiArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold transition-colors"
            >
              Lihat Fitur
            </a>
          </div>
        </motion.div>
      </section>

      {/* Social Proof */}
      <section className="px-6 py-12 border-y border-gray-800/50">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8 md:gap-16 text-center">
          <div>
            <div className="text-3xl font-bold text-white">500+</div>
            <div className="text-sm text-gray-500 mt-1">User Aktif</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">1.2M+</div>
            <div className="text-sm text-gray-500 mt-1">Media Ter-grab</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">99.9%</div>
            <div className="text-sm text-gray-500 mt-1">Uptime</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">24/7</div>
            <div className="text-sm text-gray-500 mt-1">Auto Pilot</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-20 md:py-28">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Semua yang Kamu Butuhkan
            </h2>
            <p className="mt-4 text-gray-400 max-w-xl mx-auto">
              Dari scraping sampai posting, semua fitur dalam satu dashboard.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeUp}
                className="p-6 rounded-xl border border-gray-800 bg-gray-900/50 hover:border-blue-500/40 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <f.icon className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 border-t border-gray-800/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-16">
            Cara Kerjanya
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Tambah Target", desc: "Masukkan username atau URL status X yang ingin kamu grab." },
              { step: "02", title: "Sistem Bekerja", desc: "Auto grab media, extract video, upload ke hosting pilihan kamu." },
              { step: "03", title: "Profit", desc: "Konten siap tayang. Auto post atau embed di website kamu." },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="text-center"
              >
                <div className="text-5xl font-bold text-blue-500/20 mb-4">{item.step}</div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 md:py-28 border-t border-gray-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Pilih Plan yang Cocok
            </h2>
            <p className="mt-4 text-gray-400 max-w-xl mx-auto">
              Mulai dari yang kecil, scale up kapan saja. Tanpa kontrak, batal kapan aja.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className={`relative p-8 rounded-2xl border ${
                  plan.isPopular
                    ? "border-blue-500 bg-gradient-to-b from-blue-500/10 to-transparent shadow-lg shadow-blue-500/10"
                    : "border-gray-800 bg-gray-900/50"
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-blue-600 text-xs font-semibold">
                    Paling Populer
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold">Rp {plan.price}</span>
                  <span className="text-gray-400 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <FiCheck className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={`/checkout?plan=${plan.id}`}
                  className={`block w-full text-center py-3 rounded-lg font-semibold transition-colors ${
                    plan.isPopular
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-gray-800 hover:bg-gray-700 text-gray-200"
                  }`}
                >
                  {plan.ctaText}
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">FAQ</h2>
          <div className="space-y-6">
            {[
              { q: "Apakah akun X saya aman?", a: "Ya. Kami menggunakan cookie-based auth dengan rotasi proxy untuk meminimalkan risiko. Sistem dirancang agar tidak trigger rate limit." },
              { q: "Bisa grab dari akun private?", a: "Bisa, selama akun cookie yang kamu gunakan sudah follow akun private tersebut." },
              { q: "Video di-upload kemana?", a: "Kamu bisa pilih Streamtape, DoodStream, atau keduanya. File video langsung di-upload dari server kami." },
              { q: "Bisa batal langganan kapan saja?", a: "Tentu. Tidak ada kontrak. Batal kapan saja dan akses tetap aktif sampai akhir periode billing." },
              { q: "Ada trial gratis?", a: "Hubungi kami untuk mendapatkan akses trial 3 hari di plan Starter." },
            ].map((item) => (
              <div key={item.q} className="border border-gray-800 rounded-xl p-6">
                <h3 className="font-semibold text-white mb-2">{item.q}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Siap Autopilot Konten Kamu?
          </h2>
          <p className="text-gray-400 mb-8 max-w-lg mx-auto">
            Bergabung dengan ratusan user yang sudah menghemat waktu berjam-jam setiap hari.
          </p>
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg transition-colors"
          >
            Mulai Sekarang <FiArrowRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-gray-800/50 text-center">
        <p className="text-sm text-gray-500">
          &copy; {new Date().getFullYear()} X Automation. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
