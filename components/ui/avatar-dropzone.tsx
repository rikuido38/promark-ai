"use client";

import React, { FC } from "react";
import { useDropzone, DropzoneOptions } from "react-dropzone";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvatarDropzoneProps extends Omit<DropzoneOptions, "onDrop"> {
  className?: string;
  onImageDrop: (file: File) => void;
  imageUrl?: string;
}

export const AvatarDropzone: FC<AvatarDropzoneProps> = ({
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
        "relative flex flex-col items-center justify-center border-2 border-dashed rounded-full cursor-pointer transition-colors text-center overflow-hidden",
        isDragActive
          ? "border-blue-500 bg-blue-50/50"
          : "border-gray-300 hover:border-gray-400 bg-gray-50/50",
        className
      )}
    >
      <input {...getInputProps()} />

      {imageUrl ? (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Uploaded avatar"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <p className="text-white font-medium flex items-center gap-2 text-sm max-w-[80%] text-center">
              <Upload className="w-4 h-4" /> Change
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-4">
          <Upload className="w-5 h-5 text-slate-500 mb-2" />
          <span className="text-[10px] sm:text-xs font-medium text-slate-600 leading-tight">
            Upload Avatar
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">
            1:1 ratio
          </span>
        </div>
      )}
    </div>
  );
};
