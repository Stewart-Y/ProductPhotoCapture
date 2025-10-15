export default function Header() {
  return (
    <div style={{ 
      padding: "16px 32px", 
      backgroundColor: "white",
      borderBottom: "1px solid #e2e8f0",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    }}>
      <strong style={{ 
        fontSize: "18px",
        fontWeight: "700",
        color: "#1e293b",
        letterSpacing: "-0.5px"
      }}>
        ProductPhotoCapture
      </strong>
    </div>
  );
}
