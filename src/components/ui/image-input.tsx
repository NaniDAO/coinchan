import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";

// Define proper types for the ImageInput component
interface ImageInputProps {
  onChange: (file: File | File[] | undefined) => void;
}

// Fixed ImageInput component with drag and drop and preview
export const ImageInput = ({ onChange }: ImageInputProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
      // Reset the input value to ensure onChange fires even if the same file is selected again
      e.target.value = "";
    }
  };

  const handleFile = (file: File) => {
    setSelectedFileName(file.name);

    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Call parent onChange handler
    onChange(file);

    // Clean up the preview URL when component unmounts
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files?.length) {
      handleFile(files[0]);
    }
  };

  // Clean up the URL when component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <div
        className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-md ${
          isDragging ? "border-primary bg-primary/10" : "border-input"
        } transition-colors duration-200`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-32 max-w-full object-contain rounded-md"
            />
            <div className="flex flex-col items-center">
              <p className="text-sm text-muted-foreground mb-2">
                {selectedFileName}
              </p>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
              >
                {t("common.change")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-2">{t("common.drag_drop")}</p>
            <p>{t("common.or")}</p>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="mt-2"
            >
              {t("common.browse_files")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
