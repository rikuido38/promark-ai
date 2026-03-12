"use client";

import { useState } from "react";
import { BrandVisualSettings } from "@/types/settings";
import { saveBrandVisualSettings, uploadLogoToStorage } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Plus, X } from "lucide-react";

export function BrandVisualForm({
  initialSettings,
}: {
  initialSettings: BrandVisualSettings | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initialSettings?.logo_url || null,
  );

  const fallbackSettings: BrandVisualSettings = {
    primary_colors_hex: [],
    secondary_colors_hex: [],
    composition_rules: "",
    typography_rules: "",
    logo_url: "",
  };

  const [formData, setFormData] = useState<BrandVisualSettings>(
    initialSettings || fallbackSettings,
  );

  const isDirty =
    logoFile !== null ||
    JSON.stringify(formData) !==
      JSON.stringify(initialSettings || fallbackSettings);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleColorChange = (
    name: "primary_colors_hex" | "secondary_colors_hex",
    index: number,
    value: string,
  ) => {
    setFormData((prev) => {
      const newArray = [...(prev[name] || [])];
      newArray[index] = value;
      return { ...prev, [name]: newArray };
    });
  };

  const addColor = (name: "primary_colors_hex" | "secondary_colors_hex") => {
    setFormData((prev) => ({
      ...prev,
      [name]: [...(prev[name] || []), "#000000"],
    }));
  };

  const removeColor = (
    name: "primary_colors_hex" | "secondary_colors_hex",
    index: number,
  ) => {
    setFormData((prev) => {
      const newArray = [...(prev[name] || [])];
      newArray.splice(index, 1);
      return { ...prev, [name]: newArray };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let dbLogoPath = formData.logo_url;
      let displayLogoUrl = logoPreview || formData.logo_url;

      if (logoFile) {
        setUploadingLogo(true);
        const data = new FormData();
        data.append("file", logoFile);

        // upload returns a JSON string now with { signedUrl, path }
        const resultString = await uploadLogoToStorage(data);
        const result = JSON.parse(resultString);

        dbLogoPath = result.path;
        displayLogoUrl = result.signedUrl;

        setUploadingLogo(false);
      }

      // Save the relative path to db, not the signed URL
      const finalData = { ...formData, logo_url: dbLogoPath };
      await saveBrandVisualSettings(finalData);

      // Keep the signed url in the preview state so it doesn't break after save
      setFormData(finalData);
      setLogoPreview(displayLogoUrl || null);
      setLogoFile(null);

      toast.success("Brand visuals saved successfully");
      router.refresh();
    } catch {
      toast.error("Failed to save brand visuals");
      setUploadingLogo(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (file: File) => {
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brand Visuals</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Define the core visual rules and aesthetics for your organization.
            These settings will be used by the Vision and Creative APIs.
          </p>
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-40"
          disabled={!isDirty || loading}
        >
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl bg-white p-8 rounded-lg border shadow-sm">
        {/* Logo Upload */}
        <div className="md:col-span-2 space-y-2">
          <Label className="text-sm font-medium">Brand Logo</Label>
          <div className="relative max-w-sm">
            {uploadingLogo && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 rounded-lg">
                <span className="text-sm font-medium animate-pulse">
                  Uploading...
                </span>
              </div>
            )}
            <ImageDropzone
              onImageDrop={handleLogoUpload}
              imageUrl={logoPreview || formData.logo_url}
              className="h-40"
            />
          </div>
        </div>

        {/* Colors Row */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Primary Colors */}
          <div className="space-y-3 p-4 border rounded-lg bg-slate-50/50">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Primary Colors</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addColor("primary_colors_hex")}
                className="h-7 px-2 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Color
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              {(formData.primary_colors_hex || []).map((color, index) => (
                <div key={index} className="relative group">
                  <div className="h-10 w-10 rounded-full border-2 border-white shadow-sm overflow-hidden flex-shrink-0 relative ring-1 ring-border">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) =>
                        handleColorChange(
                          "primary_colors_hex",
                          index,
                          e.target.value,
                        )
                      }
                      className="absolute inset-[-10px] w-16 h-16 cursor-pointer"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeColor("primary_colors_hex", index)}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {(!formData.primary_colors_hex ||
                formData.primary_colors_hex.length === 0) && (
                <span className="text-sm text-muted-foreground py-2 italic">
                  No primary colors added.
                </span>
              )}
            </div>
          </div>

          {/* Secondary Colors */}
          <div className="space-y-3 p-4 border rounded-lg bg-slate-50/50">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Secondary Colors</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addColor("secondary_colors_hex")}
                className="h-7 px-2 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Color
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              {(formData.secondary_colors_hex || []).map((color, index) => (
                <div key={index} className="relative group">
                  <div className="h-10 w-10 rounded-full border-2 border-white shadow-sm overflow-hidden flex-shrink-0 relative ring-1 ring-border">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) =>
                        handleColorChange(
                          "secondary_colors_hex",
                          index,
                          e.target.value,
                        )
                      }
                      className="absolute inset-[-10px] w-16 h-16 cursor-pointer"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeColor("secondary_colors_hex", index)}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {(!formData.secondary_colors_hex ||
                formData.secondary_colors_hex?.length === 0) && (
                <span className="text-sm text-muted-foreground py-2 italic">
                  No secondary colors added.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Typography Rules */}
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="typography_rules" className="text-sm font-medium">
            Typography Rules
          </Label>
          <Textarea
            id="typography_rules"
            name="typography_rules"
            placeholder="Use Helvetica for headings, Inter for body..."
            value={formData.typography_rules || ""}
            onChange={handleChange}
            className="min-h-[100px]"
          />
        </div>

        {/* Composition Rules */}
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="composition_rules" className="text-sm font-medium">
            Composition Rules
          </Label>
          <Textarea
            id="composition_rules"
            name="composition_rules"
            placeholder="Rule of thirds, centered subject, minimum negative space..."
            value={formData.composition_rules || ""}
            onChange={handleChange}
            className="min-h-[100px]"
          />
        </div>
      </div>
    </form>
  );
}
