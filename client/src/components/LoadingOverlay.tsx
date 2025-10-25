import Spinner from "./Spinner";

export default function LoadingOverlay({ message = "Loading..." }: { message?: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        gap: "16px"
      }}
    >
      <Spinner size={48} color="#ffffff" />
      <div style={{ color: "white", fontSize: "16px", fontWeight: "600" }}>
        {message}
      </div>
    </div>
  );
}
