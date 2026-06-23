export type ProviderAuthMode = "api" | "oauth";

export type ProviderModel = {
  id: string;
  name: string;
  variants: string[];
  supportsImage: boolean;
  releaseDate: string;
};

export type ProviderItem = {
  id: string;
  name: string;
  api?: string;
  models: ProviderModel[];
};
