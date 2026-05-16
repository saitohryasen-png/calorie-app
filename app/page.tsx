'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type Dish = {
  name: string;
  kcal_min: number;
  kcal_max: number;
};

type Result = {
  dishes: Dish[];
  total_min: number;
  total_max: number;
  comment: string;
};

type HistoryEntry = {
  id: string;
  thumbnail: string;
  result: Result;
  timestamp: number;
};

const STORAGE_KEY = 'calorie-history';
const GOAL_KEY = 'calorie-goal';
const MAX_PX = 1024;
const JPEG_QUALITY = 0.82;

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.src = dataUrl;
  });
}

function makeThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 80;
      const scale = size / Math.max(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [dailyGoal, setDailyGoal] = useState(2000);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('2000');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHistory(JSON.parse(stored));
      const storedGoal = localStorage.getItem(GOAL_KEY);
      if (storedGoal) {
        const g = parseInt(storedGoal, 10);
        if (!isNaN(g) && g > 0) { setDailyGoal(g); setGoalInput(String(g)); }
      }
    } catch {}
  }, []);

  const saveHistory = (entries: HistoryEntry[]) => {
    setHistory(entries);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {}
  };

  const applyImage = async (dataUrl: string) => {
    const compressed = await compressImage(dataUrl);
    setPreview(compressed);
    setBase64Data(compressed.split(',')[1]);
    setResult(null);
    setError('');
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => applyImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const openCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setError('カメラへのアクセスが拒否されました。ブラウザの設定を確認してください。');
    }
  };

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    stopCamera();
    await applyImage(canvas.toDataURL('image/jpeg'));
  };

  const analyze = async () => {
    if (!base64Data || !preview) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mediaType: 'image/jpeg' }),
      });
      if (!res.ok) throw new Error('サーバーエラー');
      const data: Result = await res.json();
      setResult(data);

      const thumbnail = await makeThumbnail(preview);
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        thumbnail,
        result: data,
        timestamp: Date.now(),
      };
      saveHistory([entry, ...history]);
    } catch {
      setError('分析中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => saveHistory([]);

  const historyTotalMin = history.reduce((s, e) => s + e.result.total_min, 0);
  const historyTotalMax = history.reduce((s, e) => s + e.result.total_max, 0);
  const historyMid = Math.round((historyTotalMin + historyTotalMax) / 2);
  const barPercent = Math.min(100, Math.round((historyMid / dailyGoal) * 100));
  const barColor =
    barPercent < 67 ? 'bg-green-500' : barPercent < 100 ? 'bg-yellow-500' : 'bg-red-500';

  const commitGoal = () => {
    const g = parseInt(goalInput, 10);
    if (!isNaN(g) && g > 0) {
      setDailyGoal(g);
      try { localStorage.setItem(GOAL_KEY, String(g)); } catch {}
    } else {
      setGoalInput(String(dailyGoal));
    }
    setEditingGoal(false);
  };

  return (
    <main className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">

        {/* メインカード */}
        <div className="bg-white rounded-2xl shadow-md border border-orange-100 p-6 space-y-4">
          <h1 className="text-xl font-bold text-gray-900">🍽️ カロリー推定アプリ</h1>

          {/* ドロップゾーン */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition
              ${dragging ? 'border-green-500 bg-green-50' : 'border-orange-300 bg-orange-50 hover:bg-orange-100'}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <p className="text-orange-700 font-medium text-sm">ここをタップ、またはドラッグ＆ドロップ</p>
            <p className="text-orange-400 text-xs mt-1">JPG / PNG / WEBP</p>
            <input
              ref={fileInputRef}
              type="file" accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {/* カメラボタン */}
          <button
            className="w-full bg-orange-100 border border-orange-300 rounded-xl py-2 text-sm font-medium text-orange-800 hover:bg-orange-200 transition"
            onClick={openCamera}
          >
            📷 カメラで撮影
          </button>

          {/* カメラビュー */}
          {cameraOpen && (
            <div className="rounded-xl overflow-hidden border border-gray-200 space-y-2">
              <video ref={videoRef} autoPlay playsInline className="w-full rounded-t-xl" />
              <div className="flex gap-2 px-2 pb-2">
                <button onClick={capturePhoto} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-xl transition">
                  📸 撮影する
                </button>
                <button onClick={stopCamera} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-xl transition">
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* プレビュー */}
          {preview && (
            <img src={preview} alt="プレビュー" className="w-full max-h-72 object-contain rounded-xl border border-gray-200" />
          )}

          {/* 分析ボタン */}
          {base64Data && (
            <button
              onClick={analyze}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3 rounded-xl transition"
            >
              {loading ? '分析中...' : '✨ カロリーを分析する'}
            </button>
          )}

          {/* エラー */}
          {error && (
            <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</p>
          )}

          {/* 最新の結果 */}
          {result && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-2 bg-gray-50">
              {result.dishes.map((d, i) => (
                <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-200">
                  <span className="text-gray-800">{d.name}</span>
                  <span className="text-green-700 font-semibold">{d.kcal_min}〜{d.kcal_max} kcal</span>
                </div>
              ))}
              <div className="flex justify-between font-bold pt-2 text-base">
                <span className="text-gray-900">合計</span>
                <span className="text-green-700">{result.total_min}〜{result.total_max} kcal</span>
              </div>
              {result.comment && (
                <p className="text-sm text-gray-600 pt-1 border-t border-gray-200">{result.comment}</p>
              )}
              <p className="text-xs text-gray-500">※ 目視推定のため±30%程度の誤差があります</p>
            </div>
          )}
        </div>

        {/* 履歴カード */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md border border-orange-100 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">📋 分析履歴</h2>
              <button onClick={clearHistory} className="text-xs text-gray-400 hover:text-red-500 transition">
                履歴を削除
              </button>
            </div>

            {/* 累計カロリー */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-orange-800">累計カロリー</span>
                <span className="font-bold text-orange-700 text-lg">
                  {historyTotalMin}〜{historyTotalMax} kcal
                </span>
              </div>
              <div className="w-full bg-orange-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${barPercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-xs text-orange-500">
                <span>{barPercent}%</span>
                {editingGoal ? (
                  <div className="flex items-center gap-1">
                    <span>目標</span>
                    <input
                      type="number"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      onBlur={commitGoal}
                      onKeyDown={(e) => e.key === 'Enter' && commitGoal()}
                      className="w-20 border border-orange-300 rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-orange-400"
                      autoFocus
                    />
                    <span>kcal</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingGoal(true)}
                    className="underline decoration-dotted hover:text-orange-700 transition"
                  >
                    目標 {dailyGoal} kcal
                  </button>
                )}
              </div>
            </div>

            {/* 履歴リスト */}
            <div className="space-y-2">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 border border-gray-100 rounded-xl p-3 bg-gray-50">
                  <img src={entry.thumbnail} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">{formatDate(entry.timestamp)}</p>
                    <p className="text-sm text-gray-700 truncate">
                      {entry.result.dishes.map((d) => d.name).join('・')}
                    </p>
                  </div>
                  <span className="text-green-700 font-semibold text-sm shrink-0 text-right">
                    {entry.result.total_min}〜{entry.result.total_max}<br />
                    <span className="text-xs font-normal">kcal</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
