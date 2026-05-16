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

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('image/jpeg');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setMediaType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setBase64Data(dataUrl.split(',')[1]);
      setResult(null);
      setError('');
    };
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

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');
    setPreview(dataUrl);
    setBase64Data(dataUrl.split(',')[1]);
    setMediaType('image/jpeg');
    setResult(null);
    stopCamera();
  };

  const analyze = async () => {
    if (!base64Data) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mediaType }),
      });
      if (!res.ok) throw new Error('サーバーエラー');
      const data = await res.json();
      setResult(data);
    } catch {
      setError('分析中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-md border border-orange-100 p-6 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">
          🍽️ カロリー推定アプリ
        </h1>

        {/* ドロップゾーン */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition
            ${dragging ? 'border-green-500 bg-green-50' : 'border-orange-300 bg-orange-50 hover:bg-orange-100'}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <p className="text-orange-700 font-medium text-sm">
            ここをタップ、またはドラッグ＆ドロップ
          </p>
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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-t-xl"
            />
            <div className="flex gap-2 px-2 pb-2">
              <button
                onClick={capturePhoto}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-xl transition"
              >
                📸 撮影する
              </button>
              <button
                onClick={stopCamera}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-xl transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* プレビュー */}
        {preview && (
          <img src={preview} alt="プレビュー"
            className="w-full max-h-72 object-contain rounded-xl border border-gray-200"
          />
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
          <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {/* 結果 */}
        {result && (
          <div className="border border-gray-200 rounded-xl p-4 space-y-2 bg-gray-50">
            {result.dishes.map((d, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-200">
                <span className="text-gray-800">{d.name}</span>
                <span className="text-green-700 font-semibold">
                  {d.kcal_min}〜{d.kcal_max} kcal
                </span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2 text-base">
              <span className="text-gray-900">合計</span>
              <span className="text-green-700">
                {result.total_min}〜{result.total_max} kcal
              </span>
            </div>
            {result.comment && (
              <p className="text-sm text-gray-600 pt-1 border-t border-gray-200">{result.comment}</p>
            )}
            <p className="text-xs text-gray-500">※ 目視推定のため±30%程度の誤差があります</p>
          </div>
        )}
      </div>
    </main>
  );
}
