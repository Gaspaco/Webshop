export type YugipediaPrintingImage = {
  id: string;
  imageProvider: string | null;
  imageSourceUrl: string | null;
  imageStorageUrl: string | null;
};

export function yugipediaPrintingImagePath(printingId: string) {
  return `/card-images/yugipedia/${encodeURIComponent(printingId)}`;
}

export function preferredPrintingImage(
  printing: YugipediaPrintingImage,
) {
  if (printing.imageStorageUrl) return printing.imageStorageUrl;
  if (printing.imageProvider === "yugipedia" && printing.imageSourceUrl) {
    return yugipediaPrintingImagePath(printing.id);
  }
  return null;
}
