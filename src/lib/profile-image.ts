export const PROFILE_IMAGE_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_MAX_DATA_URL_LENGTH = 450_000;
export const PROFILE_IMAGE_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const PROFILE_IMAGE_ERROR_MESSAGE =
  "Choose a JPG, PNG, or WebP image no larger than 5 MB.";

const PROFILE_IMAGE_DATA_URL =
  /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/]+={0,2}$/;

export const isValidStoredProfileImage = (image: unknown) =>
  image === null ||
  (typeof image === "string" &&
    image.length <= PROFILE_IMAGE_MAX_DATA_URL_LENGTH &&
    PROFILE_IMAGE_DATA_URL.test(image));
