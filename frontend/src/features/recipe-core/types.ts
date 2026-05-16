export type RawIngredient =
  | string
  | {
      item?: string | null;
      name?: string | null;
      quantity?: number | string | null;
      unit?: string | null;
      emoji?: string | null;
      note?: string | null;
      source?: string | null;
      confidence?: string | null;
      needs_review?: boolean;
      missing_reason?: string | null;
      approximate?: boolean;
      quantityRange?: { min: number; max: number; unit?: string } | null;
    };

export type RawInstruction =
  | string
  | {
      instruction?: string | null;
      text?: string | null;
      source?: string | null;
      confidence?: string | null;
      needs_review?: boolean | null;
      userEdited?: boolean | null;
    };
