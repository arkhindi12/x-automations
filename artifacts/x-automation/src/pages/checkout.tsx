import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useSearch } from "wouter";
import { FiCopy, FiCheck, FiUpload, FiArrowLeft } from "react-icons/fi";

type PaymentMethod = {
  id: number;
  type: string;
  name: string;
  accountNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  qrisImageUrl: string | null;
};

type TransactionData = {
  id: number;
  amount: number;
  uniqueCode: number;
  totalAmount: number;
  status: string;
  plan: { name: string; price: string; period: string };
  paymentMethod: PaymentMethod;
};

export default function Checkout() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const planId = Number(params.get("plan"));

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<number | null>(null);
  const [transaction, setTransaction] = useState<TransactionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    fetch("/api/payments/methods")
      .then((r) => r.json())
      .then((d) => setMethods(d.methods || []))
      .catch(() => {});
  }, [user]);

  const handleCheckout = async () => {
    if (!selectedMethod || !planId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId, paymentMethodId: selectedMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTransaction(data.transaction);
    } catch (err: any) {
      alert(err.message || "Gagal membuat transaksi");
    }
    setLoading(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !transaction) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch(`/api/payments/upload-proof/${transaction.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ image: reader.result }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setUploaded(true);
      } catch (err: any) {
        alert(err.message || "Gagal upload bukti");
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const formatRupiah = (num: number) => "Rp " + num.toLocaleString("id-ID");

  // Step 1: Select payment method
  if (!transaction) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-8 transition-colors">
            <FiArrowLeft className="w-4 h-4" /> Kembali
          </button>

          <h1 className="text-2xl font-bold mb-2">Checkout</h1>
          <p className="text-gray-400 text-sm mb-8">Pilih metode pembayaran</p>

          {methods.length === 0 ? (
            <div className="text-gray-500 text-sm">Belum ada metode pembayaran tersedia. Hubungi admin.</div>
          ) : (
            <div className="space-y-3 mb-8">
              {methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMethod(m.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    selectedMethod === m.id
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {m.type === "qris" ? "QRIS" : `${m.bankName} - ${m.accountNumber}`}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedMethod === m.id ? "border-blue-500" : "border-gray-700"
                    }`}>
                      {selectedMethod === m.id && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={!selectedMethod || loading}
            className="w-full py-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? "Memproses..." : "Lanjut Bayar"}
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Show payment details & upload proof
  if (uploaded) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="w-full max-w-lg text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
            <FiCheck className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Bukti Terkirim!</h1>
          <p className="text-gray-400 mb-8">
            Pembayaran kamu sedang diverifikasi oleh admin. Kamu akan mendapat akses setelah disetujui.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
          >
            Ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-2">Detail Pembayaran</h1>
        <p className="text-gray-400 text-sm mb-8">Transfer sesuai nominal di bawah ini</p>

        {/* Plan info */}
        <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50 mb-6">
          <div className="text-sm text-gray-400">Plan</div>
          <div className="font-semibold text-lg">{transaction.plan.name} <span className="text-gray-500 text-sm font-normal">{transaction.plan.period}</span></div>
        </div>

        {/* Payment details */}
        <div className="p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Harga</span>
            <span className="font-medium">{formatRupiah(transaction.amount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Kode Unik</span>
            <span className="font-medium text-blue-400">+{transaction.uniqueCode}</span>
          </div>
          <div className="border-t border-gray-800 pt-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Total Transfer</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">{formatRupiah(transaction.totalAmount)}</span>
              <button
                onClick={() => handleCopy(String(transaction.totalAmount))}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                {copied ? <FiCheck className="w-4 h-4 text-green-400" /> : <FiCopy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Payment method info */}
        <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50 mb-6">
          {transaction.paymentMethod.type === "qris" ? (
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-3">Scan QRIS</div>
              {transaction.paymentMethod.qrisImageUrl && (
                <img src={transaction.paymentMethod.qrisImageUrl} alt="QRIS" className="w-48 h-48 mx-auto rounded-lg bg-white p-2 object-contain" />
              )}
              <div className="text-xs text-gray-500 mt-2">{transaction.paymentMethod.name}</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Bank</span>
                <span className="font-medium">{transaction.paymentMethod.bankName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">No. Rekening</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{transaction.paymentMethod.accountNumber}</span>
                  <button
                    onClick={() => handleCopy(transaction.paymentMethod.accountNumber || "")}
                    className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                  >
                    <FiCopy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Atas Nama</span>
                <span className="font-medium">{transaction.paymentMethod.accountName}</span>
              </div>
            </div>
          )}
        </div>

        {/* Upload proof */}
        <div className="mb-4">
          <p className="text-sm text-gray-400 mb-3">Sudah transfer? Upload bukti pembayaran:</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleUploadProof}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full py-3.5 rounded-lg border border-dashed border-gray-700 hover:border-blue-500 bg-gray-900/30 hover:bg-blue-500/5 text-gray-300 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {uploading ? (
              "Mengupload..."
            ) : (
              <>
                <FiUpload className="w-4 h-4" /> Upload Bukti Transfer
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-600 text-center">
          Pastikan transfer sesuai nominal (termasuk kode unik) agar pembayaran bisa diverifikasi otomatis.
        </p>
      </div>
    </div>
  );
}
