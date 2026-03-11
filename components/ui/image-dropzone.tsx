"use client";

import React, { FC } from "react";
import { useDropzone, DropzoneOptions } from "react-dropzone";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageDropzoneProps extends Omit<DropzoneOptions, "onDrop"> {
  className?: string;
  onImageDrop: (file: File) => void;
  imageUrl?: string;
}

export const ImageDropzone: FC<ImageDropzoneProps> = ({
  className,
  onImageDrop,
  imageUrl,
  ...dropzoneProps
}) => {
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onImageDrop(acceptedFiles[0]);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp", ".svg"],
    },
    maxFiles: 1,
    ...dropzoneProps,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-64 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors text-center",
        isDragActive
          ? "border-blue-500 bg-blue-50/50"
          : "border-gray-300 hover:border-gray-400 bg-gray-50/50",
        className
      )}
    >
      <input {...getInputProps()} />

      {imageUrl ? (
        <div className="absolute inset-0 p-4 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Uploaded logo"
            className="max-h-full max-w-full object-contain"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
            <p className="text-white font-medium flex items-center gap-2">
              <Upload className="w-4 h-4" /> Change Image
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-slate-200/60">
            <Upload className="w-6 h-6 text-slate-700" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-bold text-slate-900">
              Drag & Drop Files Here
            </p>
            <p className="text-sm text-slate-500">
              Drag and drop your PNG, JPG, WebP, SVG
              <br />
              images here or browse
            </p>
          </div>
          <p className="text-sm font-semibold text-blue-600 hover:underline pt-2">
            Browse File
          </p>
        </div>
      )}
    </div>
  );
};
