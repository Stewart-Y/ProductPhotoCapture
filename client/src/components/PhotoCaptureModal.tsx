import React, { useEffect, useRef, useState } from "react";
import Spinner from "./Spinner";

type Props = {
  open: boolean;
  onClose: () => void;
  itemId: string;
  onSaved: (photo: any) => void; // will receive created photo
};

type Cam = { deviceId: string; label: string };

export default function PhotoCaptureModal({ open, onClose, itemId, onSaved }: Props) {
  const [cams, setCams] = useState<Cam[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [step, setStep] = useState<"pick" | "preview" | "confirm">("pick");
  const [err, setErr] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoEnhance, setAutoEnhance] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string>("");

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const listCams = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vids = devices.filter(d => d.kind === "videoinput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i+1}` }));
    setCams(vids);
    if (vids.length && !selected) setSelected(vids[0].deviceId);
  };

  const start = async (deviceId: string) => {
    setErr("");
    stop();
    try {
      // Request high resolution video (4K if available, fallback to 1080p)
      const constraints = deviceId 
        ? { 
            video: { 
              deviceId: { ideal: deviceId },
              width: { ideal: 4096 },
              height: { ideal: 2160 },
              facingMode: "environment"
            }, 
            audio: false 
          }
        : { 
            video: {
              width: { ideal: 4096 },
              height: { ideal: 2160 },
              facingMode: "environment"
            }, 
            audio: false 
          };
      
      console.log("Requesting camera with constraints:", constraints);
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Got stream:", s);
      console.log("Stream tracks:", s.getTracks());
      
      streamRef.current = s;
      
      // Add a small delay to ensure video element is rendered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (videoRef.current) {
        console.log("Setting video srcObject");
        videoRef.current.srcObject = s;
        
        // Try to play immediately
        try {
          await videoRef.current.play();
          console.log("Video playing immediately");
        } catch (playErr) {
          console.log("Immediate play failed, waiting for metadata:", playErr);
          
          // Wait for metadata if immediate play fails
          await new Promise<void>((resolve) => {
            if (!videoRef.current) {
              resolve();
              return;
            }
            
            const timeout = setTimeout(() => {
              console.log("Metadata timeout - trying to play anyway");
              videoRef.current?.play().catch(e => console.error("Final play error:", e));
              resolve();
            }, 3000);
            
            videoRef.current.onloadedmetadata = async () => {
              clearTimeout(timeout);
              console.log("Video metadata loaded");
              try {
                await videoRef.current?.play();
                console.log("Video playing after metadata");
              } catch (err) {
                console.error("Play error:", err);
                setErr("Could not play video");
              }
              resolve();
            };
          });
        }
      } else {
        console.error("videoRef.current is null!");
        setErr("Video element not found");
      }
    } catch (e: any) { 
      console.error("Camera start error:", e);
      let message = "Could not start camera";
      
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        message = "Camera access denied. Please allow camera permissions in your browser settings.";
      } else if (e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError") {
        message = "No camera found. Please connect a camera and try again.";
      } else if (e?.name === "NotReadableError" || e?.name === "TrackStartError") {
        message = "Camera is already in use by another application.";
      } else if (e?.message) {
        message = e.message;
      }
      
      setErr(message); 
    }
  };

  const capture = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) {
      setErr("Video or canvas not ready");
      return;
    }
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) {
      setErr("Video not ready. Please wait a moment.");
      return;
    }
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) {
      setErr("Could not get canvas context");
      return;
    }
    ctx.drawImage(v, 0, 0, w, h);
    // Use higher quality (0.95) for better image preservation
    setSnapshot(c.toDataURL("image/jpeg", 0.95));
    stop(); // Stop the camera feed after capture
    setStep("confirm");
  };

  const save = async () => {
    if (!snapshot) return;
    setSaving(true);
    setErr("");
    
    try {
      const blob = await (await fetch(snapshot)).blob();
      
      // Validate blob size (10MB limit)
      if (blob.size > 10 * 1024 * 1024) {
        throw new Error('Photo size exceeds 10MB limit');
      }
      
      const form = new FormData();
      form.append("file", blob, `capture-${Date.now()}.jpg`);
      
      // Use enhancement endpoint if auto-enhance is enabled
      const endpoint = autoEnhance 
        ? `/api/items/${encodeURIComponent(itemId)}/upload-image-enhanced?enhance=true`
        : `/api/items/${encodeURIComponent(itemId)}/photos`;
      
      const r = await fetch(endpoint, { method: "POST", body: form });
      
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed (${r.status})`);
      }
      
      const photo = await r.json();
      onSaved(photo);
      setSnapshot("");
      setStep("preview");
      
      // Restart camera after saving for next photo
      if (selected) {
        await new Promise(resolve => setTimeout(resolve, 50));
        await start(selected);
      }
    } catch (e: any) {
      const message = e?.message ?? "Failed to save photo";
      setErr(message);
    } finally {
      setSaving(false);
    }
  };

  // lifecycle
  useEffect(() => {
    if (!open) { 
      stop(); 
      setStep("pick"); 
      setSnapshot(""); 
      setErr(""); 
      setLoading(false);
      return; 
    }

    if (!navigator.mediaDevices?.getUserMedia) { 
      setErr("Camera not supported"); 
      return; 
    }
    
    (async () => {
      try { 
        // Request permission first to get proper device labels
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop()); // Stop the temporary stream
        await listCams();
      } catch (e) {
        console.error("Permission error:", e);
        setErr("Camera permission denied");
      }
    })();
  }, [open]);

  const startPreview = async () => { 
    if (selected) { 
      setLoading(true);
      setErr("");
      setStep("preview"); // Change step FIRST so video element is rendered
      
      // Wait for React to render the video element
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await start(selected); 
      setLoading(false);
    } 
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" style={overlay}>
      <div style={card}>
        <div style={header}>
          <strong>Take Photo</strong>
          <button onClick={() => { onClose(); stop(); }} aria-label="Close" style={closeBtn}>✕</button>
        </div>

        {err && <div style={{ color: "crimson", marginBottom: 8 }}>{err}</div>}

        {step === "pick" && (
          <div>
            <label>Camera:&nbsp;
              <select value={selected} onChange={e => setSelected(e.target.value)} style={{ minWidth: 260, padding: 6 }}>
                {cams.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label}</option>)}
              </select>
            </label>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button onClick={startPreview} disabled={!selected || loading} style={btn}>
                {loading ? "Starting..." : "Start Camera"}
              </button>
              <button onClick={() => { onClose(); stop(); }} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div>
            <div style={{ position: "relative", background: "#000", borderRadius: 8, minHeight: 300 }}>
              <video 
                ref={videoRef} 
                playsInline 
                autoPlay 
                muted
                controls={false}
                width={480}
                height={360}
                style={{ 
                  width: "100%", 
                  height: "auto",
                  maxHeight: "400px",
                  minHeight: "300px",
                  borderRadius: 8, 
                  background: "#000",
                  display: "block",
                  objectFit: "contain"
                }} 
              />
              {loading && (
                <div style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  color: "white",
                  fontSize: 14,
                  zIndex: 10
                }}>
                  Loading camera...
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button onClick={capture} style={btn}>Capture</button>
              <button onClick={() => { stop(); setStep("pick"); }} style={btnSecondary}>Switch Camera</button>
              <button onClick={() => { onClose(); stop(); }} style={btnSecondary}>Done</button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div>
            <img src={snapshot} alt="preview" style={{ width: "100%", maxHeight: "400px", objectFit: "contain", borderRadius: 8 }} />
            
            {/* Auto-enhance checkbox */}
            <div style={{ 
              marginTop: 12, 
              marginBottom: 12,
              padding: '12px',
              backgroundColor: '#f0f9ff',
              borderRadius: '6px',
              border: '1px solid #bfdbfe'
            }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}>
                <input 
                  type="checkbox" 
                  checked={autoEnhance} 
                  onChange={(e) => setAutoEnhance(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span>✨ Auto-enhance to 4K quality (takes 5-10 seconds longer)</span>
              </label>
              <div style={{ 
                marginTop: '6px', 
                marginLeft: '24px', 
                fontSize: '12px', 
                color: '#64748b' 
              }}>
                Uses AI to upscale and enhance photo quality
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button onClick={async () => { 
                setSnapshot("");
                setErr("");
                setStep("preview"); // Change step first to render video element
                
                // Wait for video element to be rendered
                await new Promise(resolve => setTimeout(resolve, 50));
                
                if (selected) await start(selected);
              }} style={btnSecondary}>Retake</button>
              <button 
                onClick={save} 
                disabled={saving} 
                style={{
                  ...btn,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {saving && <Spinner size={16} color="#ffffff" />}
                {saving ? "Saving…" : "Save to Gallery"}
              </button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000
};
const card: React.CSSProperties = { background: "#fff", borderRadius: 10, padding: 20, width: 520, maxWidth: "100%" };
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 };
const closeBtn: React.CSSProperties = { background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 4 };
const btn: React.CSSProperties = { padding: "8px 16px", backgroundColor: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 };
const btnSecondary: React.CSSProperties = { padding: "8px 16px", backgroundColor: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 };
