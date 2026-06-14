export type UploadedImage = {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export const toListingImageInputs = (
  uploads: UploadedImage[],
  options: {
    startSortOrder?: number;
    markFirstAsPrimary?: boolean;
  } = {},
) => {
  const startSortOrder = options.startSortOrder ?? 0;
  const markFirstAsPrimary = options.markFirstAsPrimary ?? false;

  return uploads.map((upload, index) => ({
    url: upload.url,
    sortOrder: startSortOrder + index,
    isPrimary: markFirstAsPrimary && index === 0,
  }));
};
