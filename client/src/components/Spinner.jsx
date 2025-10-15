export default function Spinner({ size = 24, color = "#3b82f6" }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid ${color}30`,
        borderTop: `3px solid ${color}`,
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        display: "inline-block"
      }}
    >
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
