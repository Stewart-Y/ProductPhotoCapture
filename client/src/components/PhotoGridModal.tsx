import { useState } from "react";
import type { Photo } from "../lib/api";

interface PhotoGridModalProps {
  photos: Photo[];
  onClose: () => void;
  onSetMainImage?: (photo: Photo) => void;
  onDelete?: (photoId: string) => void;
  onReorder?: (photoIds: string[]) => void;
}

export default function PhotoGridModal({ photos, onClose, onSetMainImage, onDelete, onReorder }: PhotoGridModalProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleSetMainImage = () => {
    if (selectedPhoto && onSetMainImage) {
      onSetMainImage(selectedPhoto);
      onClose();
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex || !onReorder) return;
    
    const newPhotos = [...photos];
    const draggedPhoto = newPhotos[draggedIndex];
    newPhotos.splice(draggedIndex, 1);
    newPhotos.splice(dropIndex, 0, draggedPhoto);
    
    onReorder(newPhotos.map(p => p.id));
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px"
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "800px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px"
          }}
        >
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: "#1e293b" }}>
            Photo Gallery ({photos.length})
          </h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: "none",
              fontSize: "28px",
              cursor: "pointer",
              color: "#64748b",
              padding: "0",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: onSetMainImage ? "20px" : "0"
          }}
        >
          {photos.map((photo, index) => (
            <div 
              key={photo.id} 
              draggable={!!onReorder}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              style={{ 
                position: "relative",
                cursor: onReorder ? "move" : (onSetMainImage ? "pointer" : "default"),
                opacity: draggedIndex === index ? 0.5 : 1,
                transform: dragOverIndex === index && draggedIndex !== index ? "scale(0.95)" : "scale(1)",
                transition: "transform 0.2s, opacity 0.2s"
              }}
              onClick={() => {
                if (onSetMainImage) {
                  // Toggle selection - if already selected, deselect it
                  setSelectedPhoto(selectedPhoto?.id === photo.id ? null : photo);
                }
              }}
            >
              <img
                src={photo.thumb_url || photo.url}
                alt={`Photo ${index + 1}`}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "cover",
                  borderRadius: "8px",
                  display: "block",
                  border: dragOverIndex === index && draggedIndex !== index
                    ? "3px dashed #3b82f6"
                    : selectedPhoto?.id === photo.id 
                    ? "3px solid #3b82f6" 
                    : "2px solid #e2e8f0",
                  transition: "border 0.2s",
                  pointerEvents: "none"
                }}
              />
              
              {/* Delete button */}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete this photo?')) {
                      onDelete(photo.id);
                    }
                  }}
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "50%",
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: "18px",
                    fontWeight: "600",
                    lineHeight: "1",
                    padding: "0",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#dc2626"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ef4444"}
                >
                  ×
                </button>
              )}
              
              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  left: "8px",
                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                  color: "white",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "600"
                }}
              >
                {index + 1}
              </div>
              {selectedPhoto?.id === photo.id && (
                <div
                  style={{
                    position: "absolute",
                    top: "8px",
                    left: "8px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    borderRadius: "50%",
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: "600",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    zIndex: 5
                  }}
                >
                  ✓
                </div>
              )}
            </div>
          ))}
        </div>

        {photos.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              color: "#94a3b8",
              fontSize: "14px"
            }}
          >
            No photos yet
          </div>
        )}

        {/* Set Main Image Button */}
        {onSetMainImage && photos.length > 0 && (
          <button
            onClick={handleSetMainImage}
            disabled={!selectedPhoto}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: selectedPhoto ? "#3b82f6" : "#cbd5e1",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: selectedPhoto ? "pointer" : "not-allowed",
              marginTop: "20px"
            }}
          >
            {selectedPhoto ? "Set as Main Image" : "Select a Photo"}
          </button>
        )}
      </div>
    </div>
  );
}
