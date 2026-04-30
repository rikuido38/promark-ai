"use client";

import { useState } from "react";
import { BrandVisualSettings } from "@/types/settings";
import { saveBrandVisualSettings, uploadLogoToStorage } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { ColorPaletteGroup } from "@/components/ui/color-palette-group";

const fallbackSettings: BrandVisualSettings = {
  company_name: "",
  short_name: "",
  slogan: "",
  primary_colors_hex: [],
  primary_color_guidelines: "",
  secondary_colors_hex: [],
  secondary_color_guidelines: "",
  composition_rules: "",
  typography_rules: "",
  logo_url: "",
  logo_guidelines: "",
};

export function MasterBrandTab({
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

  const handleSave = async () => {
    setLoading(true);
    try {
      let dbLogoPath = formData.logo_url;
      let displayLogoUrl = logoPreview || formData.logo_url;

      if (logoFile) {
        setUploadingLogo(true);
        const fd = new FormData();
        fd.append("file", logoFile);
        const resultString = await uploadLogoToStorage(fd);
        const result = JSON.parse(resultString);
        dbLogoPath = result.path;
        displayLogoUrl = result.signedUrl;
        setUploadingLogo(false);
      }

      const finalData = { ...formData, logo_url: dbLogoPath };
      await saveBrandVisualSettings(finalData);

      setFormData(finalData);
      setLogoPreview(displayLogoUrl || null);
      setLogoFile(null);

      toast.success("Master Brand saved successfully");
      router.refresh();
    } catch {
      toast.error("Failed to save Master Brand");
      setUploadingLogo(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg border shadow-sm space-y-10">
      {/* Section 0 — Company Identity */}
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold">Company Identity</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Core identifiers used across all brand materials.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="company_name" className="text-sm font-medium">
              Company name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="company_name"
              name="company_name"
              placeholder="Acme Corporation"
              value={formData.company_name || ""}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="short_name" className="text-sm font-medium">
              Short name / abbreviation
            </Label>
            <Input
              id="short_name"
              name="short_name"
              placeholder="Acme"
              value={formData.short_name || ""}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slogan" className="text-sm font-medium">
              Slogan / tagline
            </Label>
            <Input
              id="slogan"
              name="slogan"
              placeholder="We make everything better."
              value={formData.slogan || ""}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Section 1 — Logo */}
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold">Logo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload your brand logo and document usage guidelines.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Brand Logo</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Supported formats: PNG, JPG, SVG. Max size: 5MB. For best results, provide a high-resolution image with a transparent background.
            </p>
            <div className="relative w-32">
              {uploadingLogo && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 rounded-lg">
                  <span className="text-xs font-medium animate-pulse">Uploading...</span>
                </div>
              )}
              <ImageDropzone
                onImageDrop={(file) => {
                  setLogoFile(file);
                  setLogoPreview(URL.createObjectURL(file));
                }}
                imageUrl={logoPreview || formData.logo_url}
                className="h-24 w-32"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="logo_guidelines" className="text-sm font-medium">
              Logo Guidelines
            </Label>
            <Textarea
              id="logo_guidelines"
              name="logo_guidelines"
              placeholder="Clear space requirements, minimum size, approved backgrounds, what to avoid..."
              value={formData.logo_guidelines || ""}
              onChange={handleChange}
              className="min-h-[88px] resize-none"
            />
          </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Section 2 — Colors */}
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold">Colours</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define the primary and secondary colour palettes for your brand.
          </p>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <ColorPaletteGroup
              label="Primary colors"
              colors={formData.primary_colors_hex || []}
              onChange={(colors) =>
                setFormData((prev) => ({ ...prev, primary_colors_hex: colors }))
              }
              emptyText="No primary colors added."
            />
            <div className="space-y-1.5">
              <Label htmlFor="primary_color_guidelines" className="text-sm font-medium">
                Primary colors guidelines
              </Label>
              <Textarea
                id="primary_color_guidelines"
                name="primary_color_guidelines"
                placeholder="When and how to use primary colors, contrast requirements..."
                value={formData.primary_color_guidelines || ""}
                onChange={handleChange}
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <ColorPaletteGroup
              label="Secondary colors"
              colors={formData.secondary_colors_hex || []}
              onChange={(colors) =>
                setFormData((prev) => ({ ...prev, secondary_colors_hex: colors }))
              }
              emptyText="No secondary colors added."
            />
            <div className="space-y-1.5">
              <Label htmlFor="secondary_color_guidelines" className="text-sm font-medium">
                Secondary colors guidelines
              </Label>
              <Textarea
                id="secondary_color_guidelines"
                name="secondary_color_guidelines"
                placeholder="Accent usage, supporting roles, combinations to avoid..."
                value={formData.secondary_color_guidelines || ""}
                onChange={handleChange}
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Section 3 — Typography */}
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold">Typography</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Specify typeface choices, hierarchy rules, and composition guidelines.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="typography_rules" className="text-sm font-medium">
            Font rules
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

      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <Button
          type="button"
          size="lg"
          className="w-40"
          disabled={!isDirty || loading}
          onClick={handleSave}
        >
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
