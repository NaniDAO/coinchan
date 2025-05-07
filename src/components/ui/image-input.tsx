import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, X } from "lucide-react";
import { motion } from "framer-motion";

interface ImageInputProps {
  /**
   * Receive the selected file(s) when the list changes.
   * If `multiple` is `false`, you'll get a single `File` or `undefined`.
   * If `multiple` is `true`, you'll get an array of `File`s.
   */
  onChange?: (value: File | File[] | undefined) => void;
  /** Allow selecting more than one image. */
  multiple?: boolean;
  /** Tailwind className merged with the root card. */
  className?: string;
}

/**
 * ImageInput – drag‑and‑drop image uploader built with **react‑dropzone**, **shadcn/ui**, and **Tailwind CSS**.
 *
 * ```tsx
 * <ImageInput onChange={(file) => handleImageChange(file)} />
 * ```
 */
export default function ImageInput({ onChange, multiple = false, className = "" }: ImageInputProps) {
  const [files, setFiles] = useState<(File & { preview: string })[]>([]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const mapped = accepted.map((file) =>
        Object.assign(file, {
          preview: URL.createObjectURL(file),
        }),
      );

      setFiles((prev) => (multiple ? [...prev, ...mapped] : mapped));
      onChange?.(multiple ? mapped : mapped[0]);
    },
    [multiple, onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      onChange?.(multiple ? next : next[0]);
      return next;
    });
  };

  return (
    <Card
      {...getRootProps()}
      className={`w-full p-4 rounded-2xl border-2 border-dashed border-muted-foreground/30 shadow-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 ${
        isDragActive ? "bg-muted/25" : ""
      } ${className}`}
    >
      <input {...getInputProps()} />

      {/* Placeholder / call‑to‑action */}
      {files.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2">
          <ImageIcon className="w-12 h-12 opacity-60" aria-hidden />
          <p className="text-sm text-muted-foreground select-none">
            {isDragActive ? "Drop the image here …" : "Drag & drop or click to select an image"}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              // Forward click to hidden input
              (e.currentTarget.parentElement?.previousSibling as HTMLInputElement)?.click();
            }}
          >
            Browse files
          </Button>
        </div>
      )}

      {/* Previews */}
      {files.length > 0 && (
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {files.map((file, idx) => (
            <motion.div
              key={file.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="relative group"
            >
              <img
                src={file.preview}
                alt={file.name}
                className="w-full h-32 object-cover rounded-xl"
                onLoad={() => URL.revokeObjectURL(file.preview)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 backdrop-blur"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(idx);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </motion.div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
